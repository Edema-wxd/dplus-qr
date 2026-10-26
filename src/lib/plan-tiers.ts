import type { Plan } from "@/lib/plans";
import { advertisedFeatures } from "@/lib/plan-features";

/**
 * Plans as a customer reads them: one tier, two billing intervals.
 *
 * `qr_plans` stores monthly and annual as separate rows (migration 013), which
 * is right for checkout and wrong for a price table, where "Pro" is one column
 * with a switch above it. This module does that folding, and only that: no
 * query, no React, so the pricing page, the billing page and the admin all show
 * the same tier the same way, and the folding is testable without a database.
 */

/** A price a customer can choose: one `qr_plans` row, already formatted. */
export type TierPrice = {
  slug: string;
  /** Whole naira, formatted, such as "4,000". */
  priceNgn: string;
  /** For the annual row, what it costs per month, formatted. */
  perMonthNgn: string;
  monthsFree: number;
  /** False until `npm run plans:sync` gives the row a Paystack plan code. */
  purchasable: boolean;
};

export type Tier = {
  /** The slug without its interval suffix: `pro` for `pro-monthly`. */
  key: string;
  name: string;
  maxCodes: number;
  historyLabel: string;
  /** What the tier includes, in the customer's words, most important first. */
  features: string[];
  monthly: TierPrice | null;
  annual: TierPrice | null;
};

/** Kobo to whole naira, formatted. Integers throughout; naira is never a float. */
export function naira(kobo: number): string {
  return Math.round(kobo / 100).toLocaleString("en-NG");
}

/** Retention in the units the pricing table was agreed in (decision 17). */
export function historyLabel(days: number): string {
  if (days >= 730) return "24 months";
  if (days >= 365) return "12 months";
  return `${days} days`;
}

/**
 * Feature lines for a tier: the limits every plan has, then whichever flags
 * the plan holds from the catalogue in `plan-features.ts`. Flags marked not
 * built are left out, because a price table is the one place an unbuilt
 * feature turns into a promise someone paid for.
 */
export function featureLines(plan: Pick<Plan, "maxCodes" | "historyDays" | "features">): string[] {
  return [
    `${plan.maxCodes.toLocaleString("en-NG")} dynamic codes`,
    "Unlimited static codes",
    `${historyLabel(plan.historyDays)} of scan history`,
    ...advertisedFeatures(plan.features),
  ];
}

/** `pro-monthly` and `pro-annual` both belong to tier `pro`. */
export function tierKey(slug: string): string {
  return slug.replace(/-(monthly|annual|annually)$/, "");
}

function price(plan: Plan): TierPrice {
  const months = plan.interval === "annually" ? 12 : 1;
  return {
    slug: plan.slug,
    priceNgn: naira(plan.amountKobo),
    perMonthNgn: naira(Math.round(plan.amountKobo / months)),
    monthsFree: typeof plan.features.months_free === "number" ? plan.features.months_free : 0,
    purchasable: plan.isActive && plan.amountKobo > 0 && plan.paystackPlanCode !== null,
  };
}

/**
 * Fold plan rows into tiers, in the order the rows arrive (callers sort by
 * `sort_order`). The monthly row describes the tier when both exist; the two
 * are seeded with identical limits, and if they ever differ the monthly one
 * is the figure the landing page's "from" price anchors to.
 */
export function groupTiers(plans: Plan[]): Tier[] {
  const tiers = new Map<string, Tier>();
  for (const plan of plans) {
    const key = tierKey(plan.slug);
    let tier = tiers.get(key);
    if (!tier || (plan.interval === "monthly" && !tier.monthly)) {
      const described = {
        key,
        name: plan.name,
        maxCodes: plan.maxCodes,
        historyLabel: historyLabel(plan.historyDays),
        features: featureLines(plan),
      };
      tier = { ...described, monthly: tier?.monthly ?? null, annual: tier?.annual ?? null };
      tiers.set(key, tier);
    }
    if (plan.interval === "monthly") tier.monthly = price(plan);
    else tier.annual = price(plan);
  }
  return [...tiers.values()];
}

/**
 * What the dashboard sidebar says under the plan meter.
 *
 * `inactive` outranks everything: every code on such an account is serving
 * the paused page. `upgrade` appears on the free plan and from 80% of the
 * code limit, early enough to act before the limit refuses a code someone
 * needed today. Otherwise the meter says nothing, because a paying customer
 * with room to spare does not need to be sold to on every page.
 */
export function usageNudge(usage: {
  planSlug: string;
  codesUsed: number;
  maxCodes: number;
  active: boolean;
}): "inactive" | "upgrade" | "none" {
  if (!usage.active) return "inactive";
  if (usage.planSlug === "free") return "upgrade";
  if (usage.maxCodes > 0 && usage.codesUsed / usage.maxCodes >= 0.8) return "upgrade";
  return "none";
}
