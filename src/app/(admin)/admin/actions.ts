"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

/**
 * Any Postgres `uuid`. Not zod's `uuid()`, which also demands an RFC version
 * and variant, and so would 404 a valid id the database happily stores.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import { getPlanById, getPlanBySlug } from "@/lib/plans";
import { flash } from "@/lib/flash";
import {
  assignPlan,
  connectPlanToPaystack,
  createPlan,
  featuresFromForm,
  newPlanSchema,
  planFieldsSchema,
  pricingSchema,
  updatePlan,
} from "@/lib/plan-admin";
import { recordChange as record, staffForAction } from "./guard";

/**
 * Staff changes. Each action re-checks that the caller is an admin, validates
 * its input with zod, delegates the rule-bearing work to `lib/plan-admin.ts`,
 * and writes an audit row naming who changed what, with the before and after.
 */

export type AdminFormState = { error?: string; notice?: string };

const REFUSED: AdminFormState = { error: "Only staff can do that." };

function fields(form: FormData) {
  return {
    name: form.get("name"),
    maxCodes: form.get("maxCodes"),
    historyDays: form.get("historyDays"),
    graceDays: form.get("graceDays"),
    sortOrder: form.get("sortOrder"),
    isActive: form.get("isActive"),
  };
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".") || "Form"}: ${issue.message}` : "Check the form.";
}

const idSchema = z.coerce.number().int().positive();

export async function savePlanAction(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const staff = await staffForAction();
  if (!staff) return REFUSED;

  const id = idSchema.safeParse(form.get("planId"));
  if (!id.success) return { error: "That plan does not exist." };
  const plan = await getPlanById(id.data);
  if (!plan) return { error: "That plan does not exist." };

  const parsed = planFieldsSchema.safeParse(fields(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  // Price fields are only on the form while the plan is not yet in Paystack.
  let pricing = null;
  if (form.has("amountNaira")) {
    const p = pricingSchema.safeParse({ amountKobo: form.get("amountNaira"), interval: form.get("interval") });
    if (!p.success) return { error: firstIssue(p.error) };
    pricing = p.data;
  }

  const features = featuresFromForm(form, plan.features);
  const result = await updatePlan(plan, parsed.data, features, pricing);
  if (!result.ok) return { error: result.error };

  await record(staff, "plan.update", "plan", plan.slug, {
    before: {
      name: plan.name,
      maxCodes: plan.maxCodes,
      historyDays: plan.historyDays,
      graceDays: plan.graceDays,
      sortOrder: plan.sortOrder,
      isActive: plan.isActive,
      amountKobo: plan.amountKobo,
      interval: plan.interval,
      features: plan.features,
    },
    after: { ...parsed.data, ...(pricing ?? {}), features },
  });

  revalidatePath("/admin/plans");
  revalidatePath("/pricing");
  return { notice: "Saved. The pricing and billing pages show the change on their next load." };
}

export async function createPlanAction(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const staff = await staffForAction();
  if (!staff) return REFUSED;

  const parsed = newPlanSchema.safeParse({
    ...fields(form),
    slug: form.get("slug"),
    amountKobo: form.get("amountNaira"),
    interval: form.get("interval"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const features = featuresFromForm(form);
  const result = await createPlan(parsed.data, features);
  if (!result.ok) return { error: result.error };

  await record(staff, "plan.create", "plan", parsed.data.slug, { ...parsed.data, features });
  revalidatePath("/admin/plans");
  await flash("plan-created");
  redirect(`/admin/plans/${result.planId}`);
}

export async function connectPaystackAction(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const staff = await staffForAction();
  if (!staff) return REFUSED;

  const id = idSchema.safeParse(form.get("planId"));
  const plan = id.success ? await getPlanById(id.data) : null;
  if (!plan) return { error: "That plan does not exist." };

  let result;
  try {
    result = await connectPlanToPaystack(plan);
  } catch (error) {
    console.error("[admin] could not connect plan to Paystack", error);
    return { error: "Paystack did not accept the request. Check PAYSTACK_SECRET_KEY and try again." };
  }
  if (!result.ok) return { error: result.error };

  await record(staff, "plan.paystack_connect", "plan", plan.slug, {
    code: result.code,
    adopted: result.adopted,
  });
  revalidatePath("/admin/plans");
  revalidatePath("/pricing");
  return {
    notice: result.adopted
      ? `Linked to the existing Paystack plan ${result.code}. It can be bought now.`
      : `Created Paystack plan ${result.code}. It can be bought now.`,
  };
}

const assignSchema = z.object({
  userId: z.string().regex(UUID),
  planSlug: z.string().regex(/^[a-z0-9-]+$/),
});

export async function assignPlanAction(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const staff = await staffForAction();
  if (!staff) return REFUSED;

  const parsed = assignSchema.safeParse({ userId: form.get("userId"), planSlug: form.get("planSlug") });
  if (!parsed.success) return { error: "Choose a plan." };

  const plan = await getPlanBySlug(parsed.data.planSlug);
  if (!plan) return { error: "That plan does not exist." };

  let result;
  try {
    result = await assignPlan(parsed.data.userId, plan);
  } catch (error) {
    // Most likely two assignments at once meeting the one-live-plan index.
    console.error("[admin] could not assign plan", error);
    return { error: "The account changed while this was saving. Reload and try again." };
  }
  if (!result.ok) return { error: result.error };

  await record(staff, "subscription.assign", "customer", parsed.data.userId, {
    from: result.previous,
    to: plan.slug,
  });
  revalidatePath(`/admin/customers/${parsed.data.userId}`);
  return { notice: `Now on ${plan.name}${plan.interval === "annually" ? " (annual)" : ""}. Their codes follow the new plan within seconds.` };
}
