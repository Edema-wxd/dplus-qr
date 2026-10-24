/**
 * Run the scan rollup and the retention sweep by hand.
 *
 *   npm run scans:rollup              # recent window, then prune
 *   npm run scans:rollup -- --days 90 # rebuild a longer window
 *   npm run scans:rollup -- --no-prune
 *
 * In production this runs nightly through /api/cron/scans. This script exists
 * for backfills and for checking the job without waiting for a scheduler.
 */
import { Pool } from "pg";

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. See .env.example.");
    process.exit(1);
  }

  const daysIndex = process.argv.indexOf("--days");
  const days = daysIndex === -1 ? 3 : Number(process.argv[daysIndex + 1]);
  const prune = !process.argv.includes("--no-prune");

  if (!Number.isFinite(days) || days < 1) {
    console.error("--days must be a positive number.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString });

  try {
    const rolled = await pool.query(
      `insert into qr_scan_daily (qr_id, day, country, device_type, scans, unique_scans)
       select
         s.qr_id,
         (s.scanned_at at time zone 'UTC')::date,
         coalesce(nullif(s.country, ''), 'unknown'),
         coalesce(nullif(s.device_type, ''), 'unknown'),
         count(*),
         count(distinct s.ip_hash)
       from qr_scans s
       where not s.is_bot
         and s.scanned_at >= (now() at time zone 'UTC')::date - make_interval(days => $1 - 1)
       group by 1, 2, 3, 4
       on conflict (qr_id, day, country, device_type) do update
         set scans = excluded.scans, unique_scans = excluded.unique_scans`,
      [Math.trunc(days)]
    );
    console.log(`rolled up ${rolled.rowCount ?? 0} day/country/device rows over ${Math.trunc(days)} day(s)`);

    if (!prune) {
      console.log("pruning skipped (--no-prune)");
      return;
    }

    const pruned = await pool.query(
      `with retention as (
         select c.id as qr_id,
                greatest(
                  coalesce(p.history_days,
                           (select max(history_days) from qr_plans where is_active)),
                  2
                ) as keep_days
         from qr_codes c
         left join qr_subscriptions sub
           on sub.user_id = c.user_id and sub.status in ('active', 'past_due')
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
         )`
    );
    console.log(`pruned ${pruned.rowCount ?? 0} raw scan row(s) already covered by the rollup`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
