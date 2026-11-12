import { queryOne } from "@/lib/db";
import { alertOnce } from "@/lib/error-alerts";
import { BACKUP_RUNS_URL, BACKUP_STALE_HOURS } from "@/lib/backup-policy";

/**
 * What the app knows about the nightly backups: only what the backup job
 * writes to `qr_backups` (scripts/backup/record.sh). The copies themselves
 * are encrypted GitHub artifacts the app cannot read and does not need to.
 *
 * The app's part is noticing when they stop: a daily check emails staff, and
 * the admin overview and the weekly summary say how the last one went.
 */

export type BackupRun = {
  at: Date;
  status: "ok" | "failed";
  bytes: number | null;
  tables: number | null;
  rows: number | null;
  runUrl: string | null;
};

export type BackupHealth =
  /** No backup has ever been recorded: the job is not set up yet. */
  | { state: "never" }
  /** The last good backup is recent. `lastRun` may be a newer failure. */
  | { state: "ok"; lastOk: BackupRun; lastRun: BackupRun }
  /** No good backup for `BACKUP_STALE_HOURS`. */
  | { state: "stale"; lastOk: BackupRun | null; lastRun: BackupRun };

type Row = {
  created_at: Date;
  status: "ok" | "failed";
  bytes: string | null;
  tables: number | null;
  row_count: string | null;
  run_url: string | null;
};

function toRun(row: Row): BackupRun {
  return {
    at: row.created_at,
    status: row.status,
    bytes: row.bytes === null ? null : Number(row.bytes),
    tables: row.tables,
    rows: row.row_count === null ? null : Number(row.row_count),
    runUrl: row.run_url,
  };
}

/** Where things stand, from the two rows that matter. Pure. */
export function judgeBackups(lastRun: BackupRun | null, lastOk: BackupRun | null, now: Date): BackupHealth {
  if (!lastRun) return { state: "never" };
  const fresh = lastOk !== null && now.getTime() - lastOk.at.getTime() <= BACKUP_STALE_HOURS * 3_600_000;
  return fresh ? { state: "ok", lastOk: lastOk!, lastRun } : { state: "stale", lastOk, lastRun };
}

export async function backupHealth(now = new Date()): Promise<BackupHealth> {
  const columns = "created_at, status, bytes, tables, row_count, run_url";
  const [lastRun, lastOk] = await Promise.all([
    queryOne<Row>(`select ${columns} from qr_backups order by created_at desc limit 1`),
    queryOne<Row>(`select ${columns} from qr_backups where status = 'ok' order by created_at desc limit 1`),
  ]);
  return judgeBackups(lastRun && toRun(lastRun), lastOk && toRun(lastOk), now);
}

/** "2.4 MB", for people. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function when(at: Date): string {
  return at.toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }) + " UTC";
}

/** One line on the last good backup, or why there is none. Pure. */
export function describeBackups(health: BackupHealth): string {
  if (health.state === "never") {
    return "No backup has been recorded yet: the nightly job is not set up (see DECISIONS.md, 8 November).";
  }
  const last = health.lastOk
    ? `last good backup ${when(health.lastOk.at)}, ${health.lastOk.bytes === null ? "size unknown" : formatBytes(health.lastOk.bytes)}, ${health.lastOk.tables ?? "?"} tables restored and checked`
    : "no good backup has ever been recorded";
  if (health.state === "stale") {
    return `No good backup in ${BACKUP_STALE_HOURS} hours: ${last}. The last run ${health.lastRun.status === "failed" ? `failed ${when(health.lastRun.at)}` : `was ${when(health.lastRun.at)}`}.`;
  }
  const failedSince = health.lastRun.status === "failed" ? ` A later run failed ${when(health.lastRun.at)}.` : "";
  return `Backups are working: ${last}.${failedSince}`;
}

/**
 * The daily check (`/api/cron/backups`): tell staff when backups that were
 * working have stopped, and when a run has failed. Silent before the first
 * backup is ever recorded; the admin overview and the weekly summary say
 * that instead, so setting it up is not nagged about daily.
 */
export async function checkBackups(now = new Date()): Promise<BackupHealth> {
  const health = await backupHealth(now);
  if (health.state === "stale") {
    await alertOnce(
      "backups-stale",
      `No database backup in ${BACKUP_STALE_HOURS} hours`,
      [
        describeBackups(health),
        "",
        "Every printed code depends on the database, and Neon's own restore window",
        "is 6 hours on the Free plan. Until a nightly backup succeeds again,",
        "anything lost further back than that cannot be recovered.",
        "",
        `The runs and their logs: ${health.lastRun.runUrl ?? BACKUP_RUNS_URL}`,
        "Re-run it from there (Run workflow) once the cause is fixed.",
      ].join("\n")
    );
  } else if (health.state === "ok" && health.lastRun.status === "failed") {
    await alertOnce(
      `backup-failed:${health.lastRun.at.toISOString()}`,
      "Last night's database backup failed",
      [
        describeBackups(health),
        "",
        "The previous copy is still recent, so nothing is at risk yet. If tonight's",
        `run fails too, this becomes a missing backup. The run: ${health.lastRun.runUrl ?? BACKUP_RUNS_URL}`,
      ].join("\n")
    );
  }
  return health;
}
