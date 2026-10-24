import { query } from "@/lib/db";

/**
 * The nightly rollup and the retention sweep.
 *
 * These two exist as a pair and must run in that order. Retention deletes raw
 * `qr_scans` rows once they are older than the owner's plan allows; the rollup
 * is what preserves the answer to every analytics question before that happens.
 * Pruning without rolling up first destroys history that cannot be rebuilt.
 *
 * Days are UTC. `scanned_at` is a timestamptz, so bucketing it without naming
 * a zone would make the boundaries depend on whatever the connection's
 * timezone happened to be, and a scan could land in a different day depending
 * on which instance rolled it up.
 */

/** Days of recent history the rollup recomputes on each run. */
const DEFAULT_WINDOW_DAYS = 3;

/** Raw rows younger than this are never pruned, whatever the plan says. */
const MIN_RAW_DAYS = 2;

export type RollupResult = { windowDays: number; rowsWritten: number };

/**
 * Clamp a requested rollup window to something sane.
 *
 * Like the analytics window, this number is interpolated into an interval
 * rather than bound -- Postgres will not take a parameter inside an interval
 * literal -- so it is clamped to a whole number in a fixed range before it
 * goes anywhere near SQL. 400 is the ceiling because a backfill of more than
 * a year is a migration, not a cron run.
 */
export function rollupWindow(days: number): number {
  if (!Number.isFinite(days)) return DEFAULT_WINDOW_DAYS;
  return Math.min(Math.max(Math.trunc(days), 1), 400);
}

/**
 * Recompute the daily rollup for the recent window.
 *
 * Recomputes rather than increments, so the job is idempotent: running it
 * twice, or re-running it after a partial failure, produces the same table
 * instead of double counting. The window covers more than one day because a
 * scan recorded just before midnight can land after the previous run.
 *
 * Bots are excluded here, exactly as they are in the dashboard's live reads,
 * so the two never disagree about what counts as a scan.
 */
export async function rollupScans(
  windowDays: number = DEFAULT_WINDOW_DAYS
): Promise<RollupResult> {
  const days = rollupWindow(windowDays);

  const rows = await query<{ qr_id: string }>(
    `insert into qr_scan_daily (qr_id, day, country, device_type, scans, unique_scans)
     select
       s.qr_id,
       (s.scanned_at at time zone 'UTC')::date                as day,
       coalesce(nullif(s.country, ''), 'unknown')             as country,
       coalesce(nullif(s.device_type, ''), 'unknown')         as device_type,
       count(*)                                               as scans,
       count(distinct s.ip_hash)                              as unique_scans
     from qr_scans s
     where not s.is_bot
       and s.scanned_at >= (now() at time zone 'UTC')::date - make_interval(days => $1 - 1)
     group by 1, 2, 3, 4
     on conflict (qr_id, day, country, device_type) do update
       set scans        = excluded.scans,
           unique_scans = excluded.unique_scans
     returning qr_id`,
    [days]
  );

  return { windowDays: days, rowsWritten: rows.length };
}

export type PruneResult = { deleted: number; floorDays: number };

/**
 * Delete raw scan rows the owner's plan no longer covers.
 *
 * Three guards, because this is the only destructive job in the system:
 *
 * - it refuses to delete anything newer than `MIN_RAW_DAYS`, whatever a plan
 *   says, so a misconfigured `history_days` of 0 cannot wipe today;
 * - it only deletes a row whose day has already been rolled up, so a failed or
 *   skipped rollup cannot turn into lost history;
 * - an account with no plan row falls back to the longest retention any active
 *   plan offers rather than the shortest, because losing someone's history
 *   over a missing join is worse than keeping it too long.
 */
export async function pruneScans(): Promise<PruneResult> {
  const rows = await query<{ id: string }>(
    `with retention as (
       select
         c.id as qr_id,
         greatest(
           coalesce(
             p.history_days,
             (select max(history_days) from qr_plans where is_active)
           ),
           $1::int
         ) as keep_days
       from qr_codes c
       left join qr_subscriptions sub
         on sub.user_id = c.user_id
        and sub.status in ('active', 'past_due')
       left join qr_plans p on p.id = sub.plan_id
     )
     delete from qr_scans s
     using retention r
     where s.qr_id = r.qr_id
       and s.scanned_at < (now() at time zone 'UTC')::date - make_interval(days => r.keep_days)
       and exists (
         select 1 from qr_scan_daily d
         where d.qr_id = s.qr_id
           and d.day = (s.scanned_at at time zone 'UTC')::date
       )
     returning s.id`,
    [MIN_RAW_DAYS]
  );

  return { deleted: rows.length, floorDays: MIN_RAW_DAYS };
}
