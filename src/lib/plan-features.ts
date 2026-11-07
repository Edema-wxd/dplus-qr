import type { PlanFeatures } from "@/lib/plans";

/**
 * Every plan feature flag the product knows, in one list.
 *
 * Flags are stored per plan in `qr_plans.features` (migration 003) and edited
 * from the staff admin, so which plan has which feature is data. What a flag
 * *does* is code -- `canExportCsv` reads `csv_export`, and so on -- which is
 * why the set of flags lives here rather than in a table: a flag the code does
 * not read would be a promise nothing keeps.
 *
 * `built: false` marks a flag that can be stored and assigned ahead of the
 * feature, but is never advertised on the pricing or billing pages until the
 * feature exists.
 */
export type FeatureDef =
  | {
      key: string;
      label: string;
      kind: "boolean";
      built: boolean;
      /** Said on the price table when the plan does not have it. */
      absent?: string;
      help: string;
    }
  | {
      key: string;
      label: string;
      kind: "choice";
      built: boolean;
      options: Record<string, string>;
      help: string;
    }
  | {
      key: string;
      label: string;
      kind: "number";
      built: boolean;
      min: number;
      max: number;
      help: string;
    };

/**
 * Keys that once meant something and must never be reused.
 *
 * `analytics` ("basic" or "trends") was seeded on six plan rows by migration
 * 013 for a long-range chart that did not exist yet. When it was built (7 Nov
 * 2026) the chart length came from `history_days` instead, since a separate
 * flag could only contradict it ("trends" with 30 days of history, or two
 * years of history and a 90-day chart). The stored values were left in place,
 * inert: `featuresFromForm` keeps keys the catalogue does not list, and
 * deleting them would change paid plan rows for nothing. Reusing the key
 * would silently switch a new feature on for every plan that still holds it.
 */
export const RETIRED_FEATURE_KEYS = ["analytics"] as const;

export const PLAN_FEATURES: readonly FeatureDef[] = [
  {
    key: "csv_export",
    label: "CSV export of scans",
    kind: "boolean",
    built: true,
    absent: "No CSV export",
    help: "Customers can download every scan of a code as a spreadsheet. Without it, the export button explains which plans include it.",
  },
  {
    key: "custom_codes",
    label: "Custom links, like /yourname",
    kind: "boolean",
    built: true,
    help: "Customers can pick their own link, like qriateplus.com/yourname, instead of a random one.",
  },
  {
    key: "insights",
    label: "Unique scans, phones and cities",
    kind: "boolean",
    built: true,
    help: "Customers see unique scans, operating systems, cities and the change against the previous period on each code. Without it those panels show what upgrading unlocks.",
  },
  {
    key: "share_stats",
    label: "Shareable stats links",
    kind: "boolean",
    built: true,
    help: "Customers can publish a read-only stats page for a code, for someone without an account. It never shows the code's destination.",
  },
  {
    key: "hosted_pages",
    label: "Hosted pages: menus, PDFs, profile cards and more",
    kind: "boolean",
    built: true,
    absent: "Link codes only",
    help: "Customers can make page codes (menu, PDF, profile card, links page and the rest). Without it they make link codes only; pages they already have keep working.",
  },
  {
    key: "video_uploads",
    label: "Video uploads",
    kind: "boolean",
    built: true,
    help: "Customers can upload video files to a video page. Without it they can still show a YouTube or Vimeo link; videos already uploaded keep playing.",
  },
  {
    key: "support",
    label: "Support",
    kind: "choice",
    built: true,
    options: {
      email: "Email support",
      whatsapp_priority: "Priority WhatsApp support",
      priority: "Priority support",
    },
    help: "Listed on the price table. This is a promise the team keeps by hand; nothing in the app changes.",
  },
  {
    key: "months_free",
    label: "Months free",
    kind: "number",
    built: true,
    min: 0,
    max: 11,
    help: "Annual plans only: the saving the price table mentions. It does not change the price; set that above.",
  },
  {
    key: "team_seats",
    label: "Team seats",
    kind: "boolean",
    built: false,
    help: "Not built yet. Stored, never advertised.",
  },
  {
    key: "bulk_creation",
    label: "Bulk creation from a spreadsheet",
    kind: "boolean",
    built: true,
    help: "Customers can make up to 500 link codes at once from a CSV or pasted rows, and download a batch's QR images as one zip. Their code limit still applies. Without it, the bulk button explains which plans include it.",
  },
];

/**
 * What a plan's features say on the price table, in catalogue order. Only
 * built features appear; `months_free` is shown by the interval switch rather
 * than as a line.
 */
export function advertisedFeatures(features: PlanFeatures): string[] {
  const lines: string[] = [];
  for (const def of PLAN_FEATURES) {
    if (!def.built || def.key === "months_free") continue;
    const value = features[def.key];
    if (def.kind === "boolean") {
      if (value === true) lines.push(def.label);
      else if (def.absent) lines.push(def.absent);
    } else if (def.kind === "choice") {
      if (typeof value === "string" && def.options[value]) lines.push(def.options[value]);
    }
  }
  return lines;
}

/** A short, human summary of one stored value, for the admin's feature matrix. */
export function describeFeature(def: FeatureDef, value: unknown): string | null {
  if (def.kind === "boolean") return value === true ? "Yes" : null;
  if (def.kind === "choice") return typeof value === "string" ? (def.options[value] ?? value) : null;
  return typeof value === "number" && value > 0 ? String(value) : null;
}
