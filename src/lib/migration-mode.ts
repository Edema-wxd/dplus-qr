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
 * - `check`: any other Vercel build (preview, development). Previews share
 *   the production database, so applying from one would push an unmerged
 *   PR's schema into production. It reports what is pending and changes
 *   nothing.
 * - `skip`: not on Vercel at all. Local `npm run build` and the
 *   `env -i ... next build` check stay exactly as they were, with no
 *   database needed.
 */
export type MigrationMode = "apply" | "check" | "skip";

export function migrationModeFor(env: Record<string, string | undefined>): MigrationMode {
  if (!env.VERCEL) return "skip";
  return env.VERCEL_ENV === "production" ? "apply" : "check";
}
