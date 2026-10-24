import { queryOne } from "@/lib/db";
import { env } from "@/lib/env";
import { getPlanBySlug, type Plan } from "@/lib/plans";
import { initializeTransaction } from "@/lib/paystack";

/**
 * Starting a checkout.
 *
 * Nothing here marks anything as paid. The browser coming back from Paystack
 * is not evidence of payment -- the webhook is, as migration 004 requires --
 * so this only ever produces a URL to send someone to.
 */
export type CheckoutRefusal = {
  ok: false;
  reason: string;
};

export type CheckoutStart = {
  ok: true;
  url: string;
  planName: string;
};

/**
 * Why a plan cannot be bought, in the customer's words.
 *
 * The downgrade case is the interesting one. INFRASTRUCTURE's eventual design
 * lets the customer choose which codes stay active when they drop below their
 * code count; until that UI exists, refusing is the honest option. Taking the
 * money and then deciding for them which printed codes go dark is the one
 * outcome that is actually unacceptable.
 */
export function planRefusal(plan: Plan, codesHeld: number): CheckoutRefusal | null {
  if (!plan.isActive) {
    return { ok: false, reason: "That plan is no longer available." };
  }
  if (plan.amountKobo <= 0 || !plan.paystackPlanCode) {
    return {
      ok: false,
      reason: "That plan cannot be bought online yet. Please contact support.",
    };
  }
  if (codesHeld > plan.maxCodes) {
    return {
      ok: false,
      reason:
        `You hold ${codesHeld} codes and the ${plan.name} plan covers ${plan.maxCodes}. ` +
        "A code cannot be given up without taking a printed code out of service, so " +
        "please contact support to move down a plan.",
    };
  }
  return null;
}

export async function startCheckout(input: {
  userId: string;
  planSlug: string;
}): Promise<CheckoutStart | CheckoutRefusal> {
  const plan = await getPlanBySlug(input.planSlug);
  if (!plan) return { ok: false, reason: "That plan does not exist." };

  // Read the email from our own row rather than the form: a form value would
  // let someone start a checkout against another account's address.
  const owner = await queryOne<{ email: string; codes_held: string }>(
    `select u.email,
            (select count(*) from qr_codes where user_id = u.id) as codes_held
     from qr_users u where u.id = $1`,
    [input.userId]
  );
  if (!owner) return { ok: false, reason: "We could not find your account." };

  const refusal = planRefusal(plan, Number(owner.codes_held));
  if (refusal) return refusal;

  const started = await initializeTransaction({
    email: owner.email,
    amountKobo: plan.amountKobo,
    planCode: plan.paystackPlanCode!,
    userId: input.userId,
    callbackUrl: `${env().QR_BASE_URL}/billing/confirming`,
  });

  return { ok: true, url: started.authorization_url, planName: plan.name };
}

export type BillingState = {
  planName: string | null;
  planSlug: string | null;
  status: string | null;
  currentPeriodEnd: Date | null;
  graceUntil: Date | null;
  cancelAtPeriodEnd: boolean;
  /** True once a paid plan is live, which is what the confirming page waits for. */
  paidAndActive: boolean;
};

/**
 * What the billing page and the confirming page both read, so the two can
 * never disagree about whether a payment has landed.
 */
export async function getBillingState(userId: string): Promise<BillingState> {
  const row = await queryOne<{
    plan_name: string;
    plan_slug: string;
    amount_kobo: string;
    status: string;
    current_period_end: Date | null;
    grace_until: Date | null;
    cancel_at_period_end: boolean;
  }>(
    `select p.name as plan_name, p.slug as plan_slug, p.amount_kobo,
            s.status, s.current_period_end, s.grace_until, s.cancel_at_period_end
     from qr_subscriptions s
     join qr_plans p on p.id = s.plan_id
     where s.user_id = $1
       and s.status in ('active', 'past_due')
     order by s.updated_at desc
     limit 1`,
    [userId]
  );

  if (!row) {
    return {
      planName: null,
      planSlug: null,
      status: null,
      currentPeriodEnd: null,
      graceUntil: null,
      cancelAtPeriodEnd: false,
      paidAndActive: false,
    };
  }

  return {
    planName: row.plan_name,
    planSlug: row.plan_slug,
    status: row.status,
    currentPeriodEnd: row.current_period_end,
    graceUntil: row.grace_until,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    // The free plan is active but not paid, and the confirming page must not
    // mistake it for a completed purchase.
    paidAndActive: row.status === "active" && Number(row.amount_kobo) > 0,
  };
}
