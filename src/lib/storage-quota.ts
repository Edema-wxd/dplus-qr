import type { PlanFeatures } from "@/lib/plans";
import { formatBytes } from "@/lib/upload-limits";

/**
 * How much page-file storage an account may hold (security audit M4,
 * DECISIONS.md 11 November 2026).
 *
 * Every PDF, photo, video and track a page shows is a file on the company's
 * UploadThing bill, public at its URL the moment it lands. Before this, the
 * only limits were per file and per request, so one account could store as
 * much as it cared to script.
 *
 * The allowance is data, like every other plan limit: `features.storage_mb`
 * on the plan row, edited from `/admin/plans`. A plan with no value gets
 * `DEFAULT_STORAGE_MB` rather than no limit, so a plan staff create later is
 * never unlimited by omission.
 *
 * What counts is every `qr_files` row the account holds, used or not: that is
 * what is being paid for. A file replaced on a page stops counting only once
 * the upload sweep clears it (a week unused, when `DELETION_SWEEPS_ENABLED`
 * is on). Logos are separate: 1MB each and a fixed number per library.
 *
 * Pure, so the rules and the sentences are tested without a database.
 */

export const DEFAULT_STORAGE_MB = 100;

const MB = 1024 * 1024;

/** The plan's allowance in bytes, counted as UploadThing counts (1MB = 1024²). */
export function storageQuotaBytes(features: PlanFeatures | null | undefined): number {
  const value = features?.storage_mb;
  const mb = typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : DEFAULT_STORAGE_MB;
  return Math.floor(mb * MB);
}

/**
 * Why these files will not fit, or null when they do. `incoming` is the total
 * of the files about to be uploaded.
 *
 * Names no plan and no price (CLAUDE.md): staff change allowances without a
 * deploy, so the sentence points at the billing page instead.
 */
export function storageRefusal(used: number, incoming: number, quota: number): string | null {
  if (used + incoming <= quota) return null;
  const left = Math.max(0, quota - used);
  const room =
    left === 0
      ? `Your account has used all ${formatBytes(quota)} of storage for page files`
      : `Your account has ${formatBytes(left)} of its ${formatBytes(quota)} for page files left`;
  return `${room}, and this upload is ${formatBytes(incoming)}. Choose a smaller file, or see Billing for plans with more room.`;
}
