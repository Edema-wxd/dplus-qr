import { queryOne } from "@/lib/db";

/**
 * What an account is currently allowed to do.
 *
 * Not to be confused with `src/lib/plans.ts`, which is the catalogue of plans
 * someone can buy. This module answers "what may *this* account do right now",
 * which is the plan it holds joined to what it has already used.
 *
 * Read from `qr_plans` through the user's subscription rather than from
 * constants, because migration 003 puts limits in that table on purpose: a
 * plan change is a row update, not a deploy.
 */
export type Entitlement = {
  planName: string;
  planSlug: string;
  /** Maximum live codes this plan allows. */
  maxCodes: number;
  /** How long raw scan rows are kept, in days. */
  historyDays: number;
  /** Codes the account already has, counting every status. */
  codesUsed: number;
  /** True while the subscription is good for serving traffic. */
  active: boolean;
};

type Row = {
  plan_name: string;
  plan_slug: string;
  max_codes: number;
  history_days: number;
  codes_used: string;
  active: boolean;
};

/**
 * One query, so the dashboard header and the create-code limit check never
 * disagree with each other.
 *
 * Counts every code the account owns, including paused and blocked ones: the
 * limit is on codes held, not codes serving. A paused code still occupies a
 * short code that can never be reissued.
 */
export async function getEntitlement(userId: string): Promise<Entitlement | null> {
  const row = await queryOne<Row>(
    `select
       p.name                                     as plan_name,
       p.slug                                     as plan_slug,
       p.max_codes,
       p.history_days,
       (select count(*) from qr_codes where user_id = $1) as codes_used,
       (s.status = 'active'
         or (s.status = 'past_due' and s.grace_until > now()))  as active
     from qr_subscriptions s
     join qr_plans p on p.id = s.plan_id
     where s.user_id = $1
       and s.status in ('active', 'past_due')
     limit 1`,
    [userId]
  );

  if (!row) return null;

  return {
    planName: row.plan_name,
    planSlug: row.plan_slug,
    maxCodes: row.max_codes,
    historyDays: row.history_days,
    codesUsed: Number(row.codes_used),
    active: row.active,
  };
}

/** Whether another code may be created, and why not when it may not. */
export function canCreateCode(
  entitlement: Entitlement | null
): { ok: true } | { ok: false; reason: string } {
  if (!entitlement) {
    return {
      ok: false,
      reason: "Your account has no active plan yet. Refresh, or contact support.",
    };
  }
  if (entitlement.codesUsed >= entitlement.maxCodes) {
    return {
      ok: false,
      reason: `The ${entitlement.planName} plan covers ${entitlement.maxCodes} codes and you are using all of them. Pause is not enough — a code you hold keeps its short code forever.`,
    };
  }
  return { ok: true };
}
