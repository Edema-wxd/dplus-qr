import type { Entitlement } from "@/lib/entitlement";
import type { Plan } from "@/lib/plans";
import { historyLabel, naira } from "@/lib/plan-tiers";
import { hasTeam } from "@/lib/seats";

/**
 * What the dashboard says when a customer reaches for something their plan
 * does not include: what the feature is, why they cannot use it, and the
 * cheapest plan that has it.
 *
 * The "which plan" part is read from the plan rows, never written into copy,
 * because staff edit plans from the admin: a hard-coded "Pro and Business"
 * goes stale the first time a flag moves. Pure, so it is tested without a
 * database; the page passes in the plans it has already read.
 */

/** Every plan gate the dashboard can show a prompt for. */
export type Gate =
  | "hosted_pages"
  | "custom_codes"
  | "csv_export"
  | "insights"
  | "share_stats"
  | "video_uploads"
  | "bulk_creation"
  | "team_seats"
  | "history"
  | "codes";

export type UpgradeOffer = {
  gate: Gate;
  /** The feature, as a heading. */
  title: string;
  /** What it does for the customer, in one sentence. */
  benefit: string;
  /** Why they cannot use it now, naming their plan. */
  why: string;
  /** The cheapest plan that includes it, or null if none on sale does. */
  unlock: { name: string; price: string } | null;
};

/** `plural` picks "are" over "is" when the title is used in a sentence. */
const COPY: Record<Exclude<Gate, "history" | "codes">, { title: string; benefit: string; plural: boolean }> = {
  hosted_pages: {
    title: "Hosted pages",
    benefit:
      "Turn a code into a menu, PDF, profile card, event page and more, hosted by us and editable after printing.",
    plural: true,
  },
  custom_codes: {
    title: "Custom links",
    benefit: "Choose your own link, like qriateplus.com/yourname, instead of a random one.",
    plural: true,
  },
  csv_export: {
    title: "CSV export",
    benefit: "Download every scan of a code as a spreadsheet, for reports or your own analysis.",
    plural: false,
  },
  insights: {
    title: "Detailed analytics",
    benefit: "See unique scans, phones by operating system, cities, and how this period compares with the last.",
    plural: true,
  },
  share_stats: {
    title: "Share stats links",
    benefit: "Give a client or manager a read-only page of a code's scans, without giving them your account.",
    plural: true,
  },
  video_uploads: {
    title: "Video uploads",
    benefit: "Upload a video file to a video page, rather than linking to YouTube or Vimeo.",
    plural: true,
  },
  team_seats: {
    title: "Team seats",
    benefit: "Invite people to work in your account with their own sign-in, as editors or as viewers.",
    plural: true,
  },
  bulk_creation: {
    title: "Bulk creation",
    benefit: "Make up to 500 codes at once from a spreadsheet, then download every QR image in one zip.",
    plural: false,
  },
};

/**
 * Plans a customer could move to, cheapest first, one per tier: the monthly
 * row where there is one, so the price quoted is the smallest commitment.
 */
function candidates(plans: Plan[]): Plan[] {
  const paid = plans
    .filter((plan) => plan.isActive && plan.amountKobo > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.amountKobo - b.amountKobo);
  const monthly = paid.filter((plan) => plan.interval === "monthly");
  return monthly.length > 0 ? monthly : paid;
}

function priced(plan: Plan | undefined): UpgradeOffer["unlock"] {
  if (!plan) return null;
  return {
    name: plan.name,
    price: `₦${naira(plan.amountKobo)} a ${plan.interval === "annually" ? "year" : "month"}`,
  };
}

/**
 * Lower-case a title's first letter for use mid-sentence, unless it starts an
 * acronym: "Hosted pages" becomes "hosted pages", "CSV export" stays.
 */
function midSentence(title: string): string {
  return /^[A-Z][a-z]/.test(title) ? title[0].toLowerCase() + title.slice(1) : title;
}

/** "Not part of your Free plan", or the no-plan equivalent. */
function whyNot(entitlement: Entitlement | null, title: string, plural: boolean): string {
  const verb = plural ? "are" : "is";
  if (!entitlement) return `Your account has no active plan, so ${midSentence(title)} ${verb} not available.`;
  return `${title} ${verb} not part of your ${entitlement.planName} plan.`;
}

/**
 * Whether a plan has the feature a gate asks for. Flags are `true`; team
 * seats are a count, and a plan has a team when it allows more than one
 * person (`hasTeam`).
 */
function holds(features: Plan["features"], gate: Exclude<Gate, "history" | "codes">): boolean {
  return gate === "team_seats" ? hasTeam(features) : features[gate] === true;
}

/** The prompt for a feature flag in `qr_plans.features`. */
export function featureOffer(
  gate: Exclude<Gate, "history" | "codes">,
  entitlement: Entitlement | null,
  plans: Plan[]
): UpgradeOffer {
  const { title, benefit, plural } = COPY[gate];
  return {
    gate,
    title,
    benefit,
    why: whyNot(entitlement, title, plural),
    unlock: priced(candidates(plans).find((plan) => holds(plan.features, gate))),
  };
}

/**
 * An offer as one sentence, for a refusal with no prompt to open: an upload
 * the server turned away. "Video uploads are not part of your Free plan. They
 * come with Pro." and then what to do instead.
 */
export function offerRefusal(offer: UpgradeOffer, instead?: string): string {
  const unlock = offer.unlock ? ` ${comesWith(offer)} ${offer.unlock.name}.` : "";
  return `${offer.why}${unlock}${instead ? ` ${instead}` : ""}`;
}

function comesWith(offer: UpgradeOffer): string {
  return offer.gate !== "history" && offer.gate !== "codes" && COPY[offer.gate].plural
    ? "They come with"
    : "It comes with";
}

/** The prompt for a chart window longer than the plan's scan history. */
export function historyOffer(days: number, entitlement: Entitlement | null, plans: Plan[]): UpgradeOffer {
  const kept = entitlement?.historyDays;
  return {
    gate: "history",
    title: `${historyLabel(days)} of scans`,
    benefit: `Look back over the last ${historyLabel(days)} of scans, and keep scan history for longer.`,
    why: kept
      ? `Your ${entitlement!.planName} plan keeps ${historyLabel(kept)} of scan history.`
      : "Your account has no active plan, so scan history is not kept.",
    unlock: priced(candidates(plans).find((plan) => plan.historyDays >= days)),
  };
}

/** The prompt when every dynamic code on the plan is in use. */
export function codesOffer(entitlement: Entitlement | null, plans: Plan[]): UpgradeOffer {
  const max = entitlement?.maxCodes ?? 0;
  const next = candidates(plans).find((plan) => plan.maxCodes > max);
  return {
    gate: "codes",
    title: "More dynamic codes",
    benefit: next
      ? `${next.name} covers ${next.maxCodes.toLocaleString("en-NG")} dynamic codes. Static codes never need a slot, on any plan.`
      : "Static codes never need a slot, on any plan.",
    why: entitlement
      ? `You are using all ${max.toLocaleString("en-NG")} dynamic codes on your ${entitlement.planName} plan. Pausing a code does not free its slot, because it keeps its printed link.`
      : "Your account has no active plan, so it cannot make dynamic codes.",
    unlock: priced(next),
  };
}
