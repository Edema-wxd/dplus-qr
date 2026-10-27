import { z } from "zod";
import { query, queryOne, withTransaction } from "@/lib/db";
import { purgeDestination } from "@/lib/codes";
import { getPlanBySlug, type Plan, type PlanFeatures } from "@/lib/plans";
import { PLAN_FEATURES } from "@/lib/plan-features";
import {
  createPaystackPlan,
  listPaystackPlans,
  paystackPlanMatches,
} from "@/lib/paystack";

/**
 * Staff changes to the plan catalogue and to which plan an account holds.
 *
 * Every function here is called from the staff admin's Server Actions, which
 * check the caller is an admin and write the audit row. The rules that keep
 * those changes from breaking billing live here, beside the SQL, so they hold
 * however the function is reached:
 *
 * - A price or interval is fixed once a plan is connected to Paystack. The
 *   customer is charged the Paystack plan's amount; changing ours afterwards
 *   would show one price and charge another.
 * - A slug is fixed once created. Checkout, the webhook and the free-plan
 *   grant all find plans by slug.
 * - A plan is never deleted, only retired: subscriptions reference it.
 */

/** Naira as typed by a person, to kobo. Whole naira only. */
const nairaSchema = z.coerce
  .number()
  .int("Whole naira only.")
  .min(0)
  .max(10_000_000)
  .transform((naira) => naira * 100);

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal(""), z.null(), z.undefined()])
  .transform((value) => value === "on" || value === "true");

export const planFieldsSchema = z.object({
  name: z.string().trim().min(1, "Give the plan a name.").max(40),
  maxCodes: z.coerce.number().int().min(0).max(100_000),
  historyDays: z.coerce.number().int().min(1).max(3650),
  graceDays: z.coerce.number().int().min(0).max(90),
  sortOrder: z.coerce.number().int().min(0).max(10_000),
  isActive: checkbox,
});

export const pricingSchema = z.object({
  amountKobo: nairaSchema,
  interval: z.enum(["monthly", "annually"]),
});

export const newPlanSchema = planFieldsSchema.merge(pricingSchema).extend({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, digits and single hyphens, like pro-monthly."),
});

/**
 * Read the catalogue's fields out of a form, merged over the plan's existing
 * flags so a key the catalogue does not know (set by hand, or by a later
 * release) survives an edit made by an earlier one.
 */
export function featuresFromForm(form: FormData, existing: PlanFeatures = {}): PlanFeatures {
  const next: PlanFeatures = { ...existing };
  for (const def of PLAN_FEATURES) {
    const raw = form.get(`feature:${def.key}`);
    if (def.kind === "boolean") {
      if (raw === "on") next[def.key] = true;
      else delete next[def.key];
    } else if (def.kind === "choice") {
      if (typeof raw === "string" && raw in def.options) next[def.key] = raw;
      else delete next[def.key];
    } else {
      const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
      if (Number.isInteger(n) && n >= def.min && n <= def.max && n > 0) next[def.key] = n;
      else delete next[def.key];
    }
  }
  return next;
}

export type PlanChange = { ok: true; planId: number } | { ok: false; error: string };

export async function updatePlan(
  plan: Plan,
  fields: z.infer<typeof planFieldsSchema>,
  features: PlanFeatures,
  pricing: z.infer<typeof pricingSchema> | null
): Promise<PlanChange> {
  if (pricing && plan.paystackPlanCode) {
    const same = pricing.amountKobo === plan.amountKobo && pricing.interval === plan.interval;
    if (!same) {
      return {
        ok: false,
        error:
          "This plan is connected to Paystack, so its price and interval are fixed. Create a new plan at the new price and retire this one.",
      };
    }
  }

  await query(
    `update qr_plans
        set name = $2, max_codes = $3, history_days = $4, grace_days = $5,
            sort_order = $6, is_active = $7, features = $8,
            amount_kobo = $9, interval = $10
      where id = $1`,
    [
      plan.id,
      fields.name,
      fields.maxCodes,
      fields.historyDays,
      fields.graceDays,
      fields.sortOrder,
      fields.isActive,
      JSON.stringify(features),
      pricing?.amountKobo ?? plan.amountKobo,
      pricing?.interval ?? plan.interval,
    ]
  );
  return { ok: true, planId: plan.id };
}

export async function createPlan(
  input: z.infer<typeof newPlanSchema>,
  features: PlanFeatures
): Promise<PlanChange> {
  if (await getPlanBySlug(input.slug)) {
    return { ok: false, error: `A plan with the slug ${input.slug} already exists.` };
  }
  const row = await queryOne<{ id: string }>(
    `insert into qr_plans
       (slug, name, amount_kobo, interval, max_codes, history_days, grace_days,
        features, sort_order, is_active)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (slug) do nothing
     returning id`,
    [
      input.slug,
      input.name,
      input.amountKobo,
      input.interval,
      input.maxCodes,
      input.historyDays,
      input.graceDays,
      JSON.stringify(features),
      input.sortOrder,
      input.isActive,
    ]
  );
  if (!row) return { ok: false, error: `A plan with the slug ${input.slug} already exists.` };
  return { ok: true, planId: Number(row.id) };
}

/**
 * Give a paid plan its Paystack plan code, which is what makes it purchasable.
 * Adopts a matching Paystack plan if one exists, so a retry after a timeout
 * never mints a duplicate; otherwise creates one.
 */
export async function connectPlanToPaystack(
  plan: Plan
): Promise<{ ok: true; code: string; adopted: boolean } | { ok: false; error: string }> {
  if (plan.paystackPlanCode) return { ok: true, code: plan.paystackPlanCode, adopted: true };
  if (plan.amountKobo <= 0) return { ok: false, error: "A free plan is never billed, so it has no Paystack plan." };

  const remote = await listPaystackPlans();
  const existing = remote.find((candidate) => paystackPlanMatches(candidate, plan));
  const code = existing
    ? existing.plan_code
    : (await createPaystackPlan({ name: plan.name, amountKobo: plan.amountKobo, interval: plan.interval }))
        .plan_code;

  // Only fills an empty column: two staff pressing the button at once cannot
  // leave the row pointing at the second of two Paystack plans.
  await query(
    `update qr_plans set paystack_plan_code = $2 where id = $1 and paystack_plan_code is null`,
    [plan.id, code]
  );
  return { ok: true, code, adopted: Boolean(existing) };
}

/**
 * Why a plan cannot be assigned to an account, or null if it can.
 *
 * A live Paystack subscription is the one thing staff may not override from
 * here: Paystack would keep charging for it and its next webhook would
 * overwrite the assignment. That change is made in Paystack (or by the
 * customer cancelling), and arrives here as a webhook.
 */
export function assignRefusal(input: {
  plan: Pick<Plan, "slug" | "name" | "maxCodes" | "isActive">;
  codesHeld: number;
  liveViaPaystack: boolean;
  currentSlug: string | null;
}): string | null {
  if (input.liveViaPaystack) {
    return "This account pays through Paystack. Change or cancel that subscription in Paystack first; the webhook will update the account.";
  }
  if (input.currentSlug === input.plan.slug) return `The account is already on ${input.plan.name}.`;
  if (!input.plan.isActive) return "That plan is retired. Reactivate it first if it should be assigned.";
  if (input.codesHeld > input.plan.maxCodes) {
    return `The account holds ${input.codesHeld} codes and ${input.plan.name} covers ${input.plan.maxCodes}. Codes are never taken away to fit a plan, so choose a larger one.`;
  }
  return null;
}

/**
 * Put an account on a plan without a payment: a comped plan, a manual invoice,
 * or moving someone between Free and a paid tier by hand.
 *
 * An assigned plan has no Paystack subscription behind it and no end date; it
 * runs until staff assign another or the customer pays through checkout,
 * whose webhook supersedes it the same way it supersedes the free plan.
 *
 * Writing `qr_subscriptions` here is the second exception to "webhooks are the
 * only writer" (the free-plan grant is the first), and is confined the same
 * way: it never touches a row that has a Paystack subscription.
 */
export async function assignPlan(
  userId: string,
  plan: Plan
): Promise<{ ok: true; previous: string | null } | { ok: false; error: string }> {
  const result = await withTransaction(async (run) => {
    const live = await run<{ id: string; paystack_subscription_code: string | null; slug: string }>(
      `select s.id, s.paystack_subscription_code, p.slug
         from qr_subscriptions s join qr_plans p on p.id = s.plan_id
        where s.user_id = $1 and s.status in ('active', 'past_due')
        for update`,
      [userId]
    );
    const held = await run<{ n: string }>(
      `select count(*) as n from qr_codes where user_id = $1 and archived_at is null`,
      [userId]
    );
    const current = live[0] ?? null;
    const refusal = assignRefusal({
      plan,
      codesHeld: Number(held[0]?.n ?? 0),
      liveViaPaystack: current?.paystack_subscription_code != null,
      currentSlug: current?.slug ?? null,
    });
    if (refusal) return { ok: false as const, error: refusal };

    if (current) {
      await run(
        `update qr_subscriptions set status = 'cancelled', updated_at = now() where id = $1`,
        [current.id]
      );
    }
    await run(
      `insert into qr_subscriptions (user_id, plan_id, status) values ($1, $2, 'active')`,
      [userId, plan.id]
    );
    return { ok: true as const, previous: current?.slug ?? null };
  });

  if (result.ok) {
    // The redirect path caches each code's serving state. Dropping it makes an
    // account that was paused serve again within seconds, not a cache window.
    // Best effort, as in the grace job: the cache expires on its own.
    const codes = await query<{ short_code: string }>(
      "select short_code from qr_codes where user_id = $1",
      [userId]
    );
    await Promise.allSettled(codes.map((code) => purgeDestination(code.short_code)));
  }
  return result;
}
