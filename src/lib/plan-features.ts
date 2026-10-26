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

export const PLAN_FEATURES: readonly FeatureDef[] = [
  {
    key: "csv_export",
    label: "CSV export of scans",
    kind: "boolean",
    built: true,
    absent: "No CSV export",
    help: "Download raw scan rows for a code. Enforced by canExportCsv.",
  },
  {
    key: "custom_codes",
    label: "Custom links, like /yourname",
    kind: "boolean",
    built: true,
    help: "Choose a short code instead of a generated one. Enforced by canUseCustomCodes.",
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
    help: "Shown on the price table. Delivered by people, not code.",
  },
  {
    key: "months_free",
    label: "Months free",
    kind: "number",
    built: true,
    min: 0,
    max: 11,
    help: "For an annual plan: how many of its twelve months the price leaves out. Display only; the price is the amount.",
  },
  {
    key: "analytics",
    label: "Analytics",
    kind: "choice",
    built: false,
    options: { basic: "Basic", trends: "Trends" },
    help: "Every plan currently gets the same charts.",
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
    label: "Bulk creation",
    kind: "boolean",
    built: false,
    help: "Not built yet. Stored, never advertised.",
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
