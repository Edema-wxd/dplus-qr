import { queryOne } from "@/lib/db";
import type { PlanFeatures } from "@/lib/plans";

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
  /**
   * The held plan's capability flags, straight from `qr_plans.features`.
   *
   * Carried here so a feature gate and the billing page's feature list read
   * the same row: the billing page advertises `csv_export` per plan, and
   * anything that enforces it has to consult the same source or the two drift
   * into advertising a limit that is not applied.
   */
  features: PlanFeatures;
  /** True while the subscription is good for serving traffic. */
  active: boolean;
};

type Row = {
  plan_name: string;
  plan_slug: string;
  max_codes: number;
  history_days: number;
  codes_used: string;
  features: PlanFeatures | null;
  active: boolean;
};

/**
 * One query, so the dashboard header and the create-code limit check never
 * disagree with each other.
 *
 * Counts every code the account owns, including paused and blocked ones: the
 * limit is on codes held, not codes serving. A paused code still occupies a
 * short code that can never be reissued. The one exception is a code staff
 * archived: it is gone from the owner's dashboard, so counting it would spend
 * their allowance on a code they can no longer see.
 */
export async function getEntitlement(userId: string): Promise<Entitlement | null> {
  const row = await queryOne<Row>(
    `select
       p.name                                     as plan_name,
       p.slug                                     as plan_slug,
       p.max_codes,
       p.history_days,
       p.features,
       (select count(*) from qr_codes where user_id = $1 and archived_at is null) as codes_used,
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
    features: row.features ?? {},
    active: row.active,
  };
}

/**
 * Whether this account may export raw scan rows as CSV.
 *
 * A paid capability: migration 013 sets `csv_export` false on free and starter
 * and true from growth up, and the billing page prints that distinction on
 * every card. It is enforced in `lib/` rather than in the route so the page
 * that offers the button and the handler that serves the bytes ask the same
 * question -- a gate applied only in the UI is not a gate.
 */
export function canExportCsv(
  entitlement: Entitlement | null
): { ok: true } | { ok: false; reason: string } {
  if (!entitlement) {
    return {
      ok: false,
      reason: "Your account has no active plan yet.",
    };
  }
  if (entitlement.features.csv_export !== true) {
    return {
      ok: false,
      reason: `CSV export is not part of the ${entitlement.planName} plan. The charts above cover the same window, and a plan that includes export is on the billing page.`,
    };
  }
  return { ok: true };
}

/**
 * Whether this account may choose its own short code (`qriateplus.com/dplus`)
 * instead of a generated one. A paid capability from `qr_plans.features`,
 * read the way `canExportCsv` reads `csv_export`, so the form that offers the
 * field and the save that honours it ask the same question.
 */
export function canUseCustomCodes(
  entitlement: Entitlement | null
): { ok: true } | { ok: false; reason: string } {
  if (!entitlement) {
    return { ok: false, reason: "Your account has no active plan yet." };
  }
  if (entitlement.features.custom_codes !== true) {
    return {
      ok: false,
      reason: `Custom links are not part of the ${entitlement.planName} plan. They come with Pro and Business.`,
    };
  }
  return { ok: true };
}

/**
 * Whether this account sees the detailed analytics: unique scans, operating
 * systems, cities and the change against the previous period. From
 * `qr_plans.features.insights` (Starter and up, migration 018). When false,
 * `codeAnalytics` does not run those queries at all, so a locked panel has
 * nothing to leak.
 */
export function canSeeInsights(entitlement: Entitlement | null): boolean {
  return entitlement?.features.insights === true;
}

/**
 * The longest analytics window this account's chart may show, in days.
 * Scan history is the plan's `history_days`; a window longer than that is
 * offered as an upgrade rather than drawn. No plan at all shows the shortest.
 */
export function chartDaysAllowed(entitlement: Entitlement | null): number {
  return entitlement?.historyDays ?? 7;
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
