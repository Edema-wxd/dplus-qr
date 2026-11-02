import { query } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { LAPSE_RETENTION_MONTHS, PRODUCT_NAME } from "@/lib/brand";
import { eraseAccountData } from "@/lib/moderation";
import { queueUploadDeletions } from "@/lib/upload-cleanup";

/**
 * The retention sweep: erase an account's codes and data six months after it
 * lapses, which the Terms and Privacy Policy promise (`LAPSE_RETENTION_MONTHS`).
 *
 * **Off until `DELETION_SWEEPS_ENABLED=true`.** Until then a run only reports
 * what it would warn and erase, sends nothing and changes nothing. Turn it on
 * after reading a dry run against production.
 *
 * Rules, in the order they protect people:
 *
 * - **An account with any live subscription is never touched**, whatever its
 *   suspension or archive state. Free accounts hold an active free plan, so
 *   they never lapse.
 * - **"Lapsed since" is the latest change to any of the account's
 *   subscriptions.** That can only be at or after the real lapse, never
 *   before it, so the sweep can run late but never early. No column records
 *   the exact moment, and none is needed for that guarantee.
 * - **No erasure without a warning at least 30 days old**, sent after the
 *   latest lapse. If the email cannot be sent, nothing is recorded, so the
 *   account is simply warned again on a later run and erased later still.
 * - **Erasing reuses `eraseAccountData`**, the same code the staff "Erase
 *   account" button runs: content deleted, profile blanked, every short code
 *   kept as an anonymous row so it can never be reissued to someone else.
 *   Payment records are kept (they are financial records, and hold no
 *   personal data once the email token is cleared).
 * - **The sign-in account is not removed here.** Neon Auth only removes a user
 *   for a signed-in admin, and a scheduled job has no session, so each one is
 *   left on the staff overview's to-do list with the existing "Remove sign-in"
 *   button. Its data is already gone either way.
 * - At most `BATCH` accounts are acted on per run.
 */

export const WARNING_DAYS = 30;
export const BATCH = 20;
const DAY_MS = 86_400_000;

export type RetentionStep = "wait" | "warn" | "erase";

function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/** When a lapsed account's data is due to go, before any warning delay. */
export function deletionDue(lapsedSince: Date): Date {
  return addMonths(lapsedSince, LAPSE_RETENTION_MONTHS);
}

/**
 * What to do with one lapsed account today. Pure, so the rules are tested
 * directly (`src/__tests__/retention.test.ts`).
 */
export function retentionStep(input: {
  lapsedSince: Date;
  warnedAt: Date | null;
  now: Date;
}): RetentionStep {
  const due = deletionDue(input.lapsedSince);
  const warnFrom = new Date(due.getTime() - WARNING_DAYS * DAY_MS);
  if (input.now < warnFrom) return "wait";

  // A warning sent before the latest lapse belongs to an earlier lapse.
  const warned = input.warnedAt !== null && input.warnedAt >= input.lapsedSince;
  if (!warned) return "warn";

  const warnedLongEnough = new Date(input.warnedAt!.getTime() + WARNING_DAYS * DAY_MS);
  return input.now >= due && input.now >= warnedLongEnough ? "erase" : "wait";
}

/** The date a warning promises: never sooner than the full warning period. */
export function promisedDeletion(lapsedSince: Date, now: Date): Date {
  const due = deletionDue(lapsedSince);
  const earliest = new Date(now.getTime() + WARNING_DAYS * DAY_MS);
  return due > earliest ? due : earliest;
}

type Candidate = {
  user_id: string;
  email: string;
  name: string;
  lapsed_since: Date;
  retention_warned_at: Date | null;
};

/**
 * Accounts with no live subscription whose warning window has opened, oldest
 * lapse first. Erased accounts are already done.
 */
async function candidates(now: Date): Promise<Candidate[]> {
  return query<Candidate>(
    `select u.id as user_id, u.email, u.name,
            max(s.updated_at) as lapsed_since,
            u.retention_warned_at
     from qr_users u
     join qr_subscriptions s on s.user_id = u.id
     where u.erased_at is null
     group by u.id
     having bool_and(s.status not in ('active', 'past_due'))
        and max(s.updated_at) <= $1::timestamptz
            - make_interval(months => $2) + make_interval(days => $3)
     order by max(s.updated_at)
     limit $4`,
    [now.toISOString(), LAPSE_RETENTION_MONTHS, WARNING_DAYS, BATCH * 5]
  );
}

export type RetentionReport = {
  enabled: boolean;
  considered: number;
  warned: number;
  erased: number;
  /** Dry run only: what an enabled run would have done. */
  wouldWarn: number;
  wouldErase: number;
  /** Erased, but their uploads could not be removed from UploadThing. */
  filesLeft: number;
  failures: number;
};

export function sweepEnabled(): boolean {
  return env().DELETION_SWEEPS_ENABLED === "true";
}

function longDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

async function warn(candidate: Candidate, now: Date): Promise<boolean> {
  if (!candidate.email) return false;
  const when = longDate(promisedDeletion(candidate.lapsed_since, now));
  const sent = await sendEmail({
    group: "plans",
    to: candidate.email,
    subject: `Your ${PRODUCT_NAME} codes will be deleted on ${when}`,
    text: [
      `Hi ${candidate.name || "there"},`,
      "",
      `Your ${PRODUCT_NAME} plan ended a while ago, so your QR codes have been showing`,
      "a paused page since then. We keep everything for",
      `${LAPSE_RETENTION_MONTHS} months after a plan ends, and that time is nearly up.`,
      "",
      `On ${when} your codes, their destinations and their scan history will be`,
      "deleted for good, and printed codes will stop working.",
      "",
      "Choosing a plan before then restores everything, exactly as it was:",
      `${env().QR_BASE_URL}/billing`,
      "",
      `— ${PRODUCT_NAME}`,
    ].join("\n"),
  });
  if (!sent) return false;
  await query(`update qr_users set retention_warned_at = $2 where id = $1 and erased_at is null`, [
    candidate.user_id,
    now.toISOString(),
  ]);
  return true;
}

async function erase(candidate: Candidate): Promise<{ ok: boolean; filesLeft: number }> {
  const erased = await eraseAccountData(candidate.user_id);
  if (!erased.ok) {
    console.error("[retention] erase refused", { userId: candidate.user_id, error: erased.error });
    return { ok: false, filesLeft: 0 };
  }

  let filesLeft = 0;
  let keysLeft: string[] = [];
  if (erased.fileKeys.length > 0) {
    try {
      if (!env().UPLOADTHING_TOKEN) throw new Error("UPLOADTHING_TOKEN is not set");
      const { UTApi } = await import("uploadthing/server");
      await new UTApi().deleteFiles(erased.fileKeys);
    } catch (error) {
      console.error("[retention] erased account but could not delete its files", {
        userId: candidate.user_id,
        error,
      });
      filesLeft = erased.fileKeys.length;
      // The rows that held these keys are gone: queue them, so the upload
      // clean-up keeps retrying until UploadThing has deleted them.
      keysLeft = erased.fileKeys;
      await queueUploadDeletions(keysLeft, "retention");
    }
  }

  // No actor: the audit trail says the schedule did it, not a person.
  await query(
    `insert into qr_admin_audit (actor_id, action, target_type, target_id, detail)
     values (null, 'retention.erase', 'customer', $1, $2::jsonb)`,
    [
      candidate.user_id,
      JSON.stringify({
        codes: erased.codes,
        files: erased.fileKeys.length,
        filesRemoved: filesLeft === 0,
        fileKeysLeft: keysLeft,
        lapsedSince: candidate.lapsed_since,
        warnedAt: candidate.retention_warned_at,
      }),
    ]
  );
  return { ok: true, filesLeft };
}

export async function runRetentionSweep(now: Date = new Date()): Promise<RetentionReport> {
  const enabled = sweepEnabled();
  const report: RetentionReport = {
    enabled,
    considered: 0,
    warned: 0,
    erased: 0,
    wouldWarn: 0,
    wouldErase: 0,
    filesLeft: 0,
    failures: 0,
  };

  const rows = await candidates(now);
  report.considered = rows.length;
  let acted = 0;

  for (const row of rows) {
    const step = retentionStep({
      lapsedSince: row.lapsed_since,
      warnedAt: row.retention_warned_at,
      now,
    });
    if (step === "wait") continue;

    if (!enabled) {
      if (step === "warn") report.wouldWarn += 1;
      else report.wouldErase += 1;
      continue;
    }

    if (acted >= BATCH) break;
    acted += 1;
    try {
      if (step === "warn") {
        if (await warn(row, now)) report.warned += 1;
        else report.failures += 1;
      } else {
        const result = await erase(row);
        if (result.ok) report.erased += 1;
        else report.failures += 1;
        report.filesLeft += result.filesLeft;
      }
    } catch (error) {
      // One account's failure must not stop the rest of the batch.
      console.error("[retention] step failed", { userId: row.user_id, step, error });
      report.failures += 1;
    }
  }

  return report;
}
