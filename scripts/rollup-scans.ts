/**
 * Run the scan rollup and the retention sweep by hand.
 *
 *   npm run scans:rollup              # recent window, then prune
 *   npm run scans:rollup -- --days 90 # rebuild a longer window
 *   npm run scans:rollup -- --no-prune
 *
 * In production this runs nightly through /api/cron/scans. This script exists
 * for backfills and for checking the job without waiting for a scheduler.
 *
 * It calls the same `rollupScans()` and `pruneScans()` the cron does rather
 * than carrying its own copy of the SQL. A copy here once kept the old
 * `qr_scan_daily` key after migration 018 re-keyed the table, and every manual
 * run failed with 42P10 while the cron carried on fine.
 *
 * Connects through `src/lib/db.ts`, so it uses `DATABASE_URL` (pooled), as the
 * cron does. Each job is a single statement, so it needs no session state.
 */
import { db } from "../src/lib/db";
import { pruneScans, rollupScans } from "../src/lib/rollup";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Run `neon env pull`, or see .env.example.");
    process.exit(1);
  }

  const daysIndex = process.argv.indexOf("--days");
  const days = daysIndex === -1 ? 3 : Number(process.argv[daysIndex + 1]);
  const prune = !process.argv.includes("--no-prune");

  if (!Number.isFinite(days) || days < 1) {
    console.error("--days must be a positive number.");
    process.exit(1);
  }

  try {
    const rolled = await rollupScans(days);
    if (rolled.windowDays !== Math.trunc(days)) {
      console.log(`--days ${days} clamped to ${rolled.windowDays}`);
    }
    console.log(
      `rolled up ${rolled.rowsWritten} day/country/device/os/city rows over ${rolled.windowDays} day(s)`
    );

    if (!prune) {
      console.log("pruning skipped (--no-prune)");
      return;
    }

    const pruned = await pruneScans();
    console.log(`pruned ${pruned.deleted} raw scan row(s) already covered by the rollup`);
  } finally {
    await db().end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
