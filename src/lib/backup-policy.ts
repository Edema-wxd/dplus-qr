/**
 * The backup policy as numbers, kept apart from the database code so the
 * legal pages can quote it (decided 8 Nov 2026; see DECISIONS.md).
 *
 * `BACKUP_KEEP_DAYS` must match `retention-days` in
 * `.github/workflows/backup.yml`, which is what actually deletes old copies.
 * `src/__tests__/backups.test.ts` fails if they drift apart.
 */

/** How long each nightly encrypted copy is kept. */
export const BACKUP_KEEP_DAYS = 30;

/**
 * How long without a good backup before staff are told. The job runs nightly
 * at 01:17 UTC and GitHub can start a scheduled run late, so a day plus a
 * margin: one missed night is noticed the next morning.
 */
export const BACKUP_STALE_HOURS = 30;

/** Where the runs, and the copies, are. */
export const BACKUP_RUNS_URL = "https://github.com/Edema-wxd/dplus-qr/actions/workflows/backup.yml";
