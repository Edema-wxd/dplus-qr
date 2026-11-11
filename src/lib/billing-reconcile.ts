import { query } from "@/lib/db";
import { purgeDestination } from "@/lib/codes";
import { alertOnce } from "@/lib/error-alerts";
import { addDays } from "@/lib/billing-events";
import { notifyPaymentFailed } from "@/lib/billing-notify";
import { fetchSubscription, type PaystackSubscription } from "@/lib/paystack";

/**
 * The period-end backstop (DECISIONS.md, 11 November 2026).
 *
 * Nothing that serves a code looks at `current_period_end`: a paid plan stays
 * live until a webhook says otherwise. So a lost `subscription.disable` left a
 * cancelled account on its plan for good, and a lost `invoice.payment_failed`
 * left an unpaid one active with no grace clock running. Once a day, every
 * Paystack subscription still `active` here two days after its period ended
 * is read back from Paystack and brought into line with what Paystack says.
 *
 * Paystack's own record is the evidence, read with our secret key, so this is
 * the same authority a webhook carries. Where Paystack's answer does not say
 * plainly what happened, nothing is changed and staff are told instead: a
 * printed code must not go dark on a guess.
 *
 * Past-due rows are not checked. Their grace period already has an end, and
 * the grace job (`grace.ts`) acts on it.
 */

/** Days after a period ends before its renewal counts as missing. */
const RENEWAL_SLACK_DAYS = 2;

/** Read from Paystack a few at a time, so the job stays well inside its limit. */
const BATCH = 25;

export type OverdueSubscription = {
  id: string;
  userId: string;
  currentPeriodEnd: Date;
  subscriptionCode: string;
  planCode: string | null;
  planName: string;
  graceDays: number;
};

export type Reconciliation =
  | { kind: "renewed"; periodEnd: Date; notRenewing: boolean }
  | { kind: "ended" }
  | { kind: "failing"; graceUntil: Date }
  | { kind: "unclear"; why: string };

/**
 * What Paystack's record of a subscription means for our row. Pure.
 *
 * - `cancelled` or `completed`: it has ended, as a `subscription.disable`
 *   would have said.
 * - `active` or `non-renewing` with a next payment date after our period end:
 *   a renewal was charged and its webhook was lost.
 * - `attention`: the last charge failed, as an `invoice.payment_failed` would
 *   have said, so the plan's grace period starts now.
 * - Anything else, including a plan that differs from ours, is left alone.
 */
export function decideReconciliation(
  row: OverdueSubscription,
  paystack: PaystackSubscription,
  now: Date
): Reconciliation {
  const theirPlan = paystack.plan?.plan_code ?? null;
  if (theirPlan && row.planCode && theirPlan !== row.planCode) {
    return { kind: "unclear", why: `Paystack has it on plan ${theirPlan}, this database on ${row.planCode}` };
  }

  switch (paystack.status) {
    case "cancelled":
    case "completed":
      return { kind: "ended" };

    case "active":
    case "non-renewing": {
      const next = paystack.next_payment_date ? new Date(paystack.next_payment_date) : null;
      if (next && !Number.isNaN(next.getTime()) && next > row.currentPeriodEnd) {
        return { kind: "renewed", periodEnd: next, notRenewing: paystack.status === "non-renewing" };
      }
      return {
        kind: "unclear",
        why: `Paystack says ${paystack.status}, next payment ${paystack.next_payment_date ?? "not set"}`,
      };
    }

    case "attention":
      return { kind: "failing", graceUntil: addDays(now, row.graceDays) };

    default:
      return { kind: "unclear", why: `Paystack says ${paystack.status}` };
  }
}

export type ReconcileResult = {
  checked: number;
  renewed: number;
  ended: number;
  failing: number;
  unclear: number;
};

export async function reconcileOverdueSubscriptions(now = new Date()): Promise<ReconcileResult> {
  const rows = await query<{
    id: string;
    user_id: string;
    current_period_end: Date;
    paystack_subscription_code: string;
    plan_code: string | null;
    plan_name: string;
    grace_days: number;
  }>(
    `select s.id, s.user_id, s.current_period_end, s.paystack_subscription_code,
            p.paystack_plan_code as plan_code, p.name as plan_name, p.grace_days
       from qr_subscriptions s
       join qr_plans p on p.id = s.plan_id
      where s.status = 'active'
        and s.paystack_subscription_code is not null
        and s.current_period_end < now() - make_interval(days => $1)
      order by s.current_period_end
      limit $2`,
    [RENEWAL_SLACK_DAYS, BATCH]
  );

  const result: ReconcileResult = { checked: 0, renewed: 0, ended: 0, failing: 0, unclear: 0 };
  const unclear: string[] = [];

  for (const raw of rows) {
    const row: OverdueSubscription = {
      id: raw.id,
      userId: raw.user_id,
      currentPeriodEnd: raw.current_period_end,
      subscriptionCode: raw.paystack_subscription_code,
      planCode: raw.plan_code,
      planName: raw.plan_name,
      graceDays: raw.grace_days,
    };
    result.checked++;

    let decision: Reconciliation;
    try {
      decision = decideReconciliation(row, await fetchSubscription(row.subscriptionCode), now);
    } catch (error) {
      decision = {
        kind: "unclear",
        why: `could not read it from Paystack (${error instanceof Error ? error.message : "unknown error"})`,
      };
    }

    if (decision.kind === "unclear") {
      result.unclear++;
      unclear.push(`  ${row.subscriptionCode} (account ${row.userId}): ${decision.why}`);
      continue;
    }

    // Each write re-checks the row is as it was read, so a webhook that lands
    // in the meantime wins and this run changes nothing.
    const changed = await applyReconciliation(row, decision);
    if (!changed) continue;
    result[decision.kind]++;

    if (decision.kind !== "renewed") {
      await purgeOwnerCodes(row.userId);
    }
    if (decision.kind === "failing") {
      await notifyPaymentFailed({ userId: row.userId, planName: row.planName, graceUntil: decision.graceUntil });
    }
  }

  if (unclear.length > 0) {
    await alertOnce(
      `paystack-reconcile:${now.toISOString().slice(0, 10)}`,
      "Subscriptions past their period end",
      [
        "These Paystack subscriptions are still active here although their period",
        `ended more than ${RENEWAL_SLACK_DAYS} days ago, and Paystack's record did not say`,
        "plainly what happened, so nothing was changed:",
        "",
        ...unclear,
        "",
        "Check each in the Paystack dashboard, then assign or end the plan from the",
        "customer's page in the admin. They are listed again tomorrow until resolved.",
      ].join("\n")
    );
  }

  return result;
}

async function applyReconciliation(
  row: OverdueSubscription,
  decision: Exclude<Reconciliation, { kind: "unclear" }>
): Promise<boolean> {
  const guard = "id = $1 and status = 'active' and current_period_end = $2";
  const base = [row.id, row.currentPeriodEnd];

  switch (decision.kind) {
    case "renewed": {
      const rows = await query(
        `update qr_subscriptions
            set current_period_end   = $3,
                cancel_at_period_end = cancel_at_period_end or $4,
                updated_at           = now()
          where ${guard}
          returning id`,
        [...base, decision.periodEnd, decision.notRenewing]
      );
      return rows.length > 0;
    }
    case "ended": {
      const rows = await query(
        `update qr_subscriptions set status = 'cancelled', updated_at = now()
          where ${guard}
          returning id`,
        base
      );
      return rows.length > 0;
    }
    case "failing": {
      const rows = await query(
        `update qr_subscriptions set status = 'past_due', grace_until = $3, updated_at = now()
          where ${guard}
          returning id`,
        [...base, decision.graceUntil]
      );
      return rows.length > 0;
    }
  }
}

/** Best effort, like the webhook's: the cache expires on its own regardless. */
async function purgeOwnerCodes(userId: string): Promise<void> {
  const codes = await query<{ short_code: string }>("select short_code from qr_codes where user_id = $1", [userId]);
  await Promise.allSettled(codes.map((code) => purgeDestination(code.short_code)));
}
