/**
 * Staging, as the app and the scripts see it (decided 12 Nov 2026; see
 * docs/qr-platform/STAGING.md).
 *
 * Vercel's Preview environment is staging: every PR preview, and the
 * standing `staging` branch served at `STAGING_HOST`, run on the staging
 * Neon branch, never on production. The deploy says which it is through
 * `VERCEL_ENV`; the database says so through `STAGING_SETTING`
 * (src/lib/migration-mode.ts), and anything that writes checks the database.
 */

export const STAGING_HOST = "staging.qriateplus.com";

/** A preview deployment, which is staging. Read at build and at run time. */
export function isStagingDeploy(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === "preview";
}

/**
 * Which database a connection string reaches. On Neon that is the compute
 * endpoint ("ep-cool-rain-123"), pooled or direct alike, since one endpoint
 * serves one branch. Anywhere else it is host, port and database name.
 */
export function databaseEndpoint(connectionString: string): string | null {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const first = host.split(".")[0];
  if (first.startsWith("ep-")) return first.replace(/-pooler$/, "");
  return `${host}:${url.port || "5432"}${url.pathname}`;
}

/** True when the two connection strings reach the same database branch. */
export function sameDatabase(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const left = databaseEndpoint(a);
  return left !== null && left === databaseEndpoint(b);
}
