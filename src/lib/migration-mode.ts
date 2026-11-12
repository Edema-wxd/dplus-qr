/**
 * What the migration runner should do when it runs as part of a deploy.
 *
 * Pure, so the rule is tested rather than trusted (see
 * `src/__tests__/migration-mode.test.ts`). The runner itself lives in
 * `scripts/migrate.ts`.
 *
 * - `apply`: a Vercel production build. Pending migrations are applied before
 *   `next build`, so a deploy can never go live ahead of the schema it needs.
 *   That is the failure that took scans down on 27 October 2026: migration
 *   017 was merged and deployed, the redirect's one query named its new
 *   column, and every scan fell to the unavailable page until someone ran it
 *   by hand.
 * - `staging`: a Vercel preview build. Previews run on the staging database
 *   (STAGING.md), so they apply, but only after the database itself says it
 *   is staging (`STAGING_SETTING`, set by `npm run staging -- mark`). A
 *   preview pointed at production by mistake finds no mark there and only
 *   reports, so an unmerged PR's schema can never reach production.
 * - `check`: any other Vercel build (development, or no environment named).
 *   It reports what is pending and changes nothing.
 * - `skip`: not on Vercel at all. Local `npm run build` and the
 *   `env -i ... next build` check stay exactly as they were, with no
 *   database needed.
 */
export type MigrationMode = "apply" | "staging" | "check" | "skip";

/**
 * The database-level setting that marks a database as staging, read with
 * `current_setting('qr.environment', true)`. Set with `alter database`, so it
 * survives the staging reset (which drops and rebuilds the schema), and is
 * never copied into production: production is the parent of the staging
 * branch, not its child.
 */
export const STAGING_SETTING = "qr.environment";
export const STAGING_VALUE = "staging";

export function migrationModeFor(env: Record<string, string | undefined>): MigrationMode {
  if (!env.VERCEL) return "skip";
  if (env.VERCEL_ENV === "production") return "apply";
  if (env.VERCEL_ENV === "preview") return "staging";
  return "check";
}
