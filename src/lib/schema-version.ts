/**
 * The newest migration this build of the code expects to have run.
 *
 * `/health` compares it with `schema_migrations`, so code running ahead of its
 * database shows up as `migrations: "behind"` rather than as a scan path that
 * fails on a missing column (as migration 017 did on 27 October 2026).
 * Production deploys apply migrations before building, so in production this
 * should only ever read "behind" if that step was skipped. A preview, which
 * shares the production database, reads "behind" whenever its branch adds a
 * migration that has not shipped yet, which is true and expected.
 *
 * A constant, not a directory listing, because a serverless function cannot
 * count on `db/migrations` being on disk at runtime.
 * `src/__tests__/schema-version.test.ts` fails if a migration is added
 * without updating it.
 */
export const LATEST_MIGRATION = "021_upload_deletions";
