/**
 * Location lookup, stubbed by design.
 *
 * Deferred until the MaxMind GeoLite2 licence is confirmed for commercial use.
 * Until then scans record a null country and city; the column exists and the
 * rollup handles nulls, so enabling this later needs no migration.
 *
 * Two ways to fill it in:
 *   - platform headers, if this deploys behind a host that supplies them
 *     (`x-vercel-ip-country`, `cf-ipcountry`): no licence, no startup cost
 *   - the `maxmind` package with a bundled GeoLite2 City database: host
 *     independent, but 60MB loaded once at startup and refreshed monthly
 *
 * Both satisfy this signature, so the choice is not a rewrite.
 */
export type Location = {
  country: string | null;
  city: string | null;
};

const EMPTY: Location = { country: null, city: null };

export function lookupLocation(_ip: string | null, headers?: Headers): Location {
  // Free and licence-clear when present; absent locally and on cPanel.
  const header =
    headers?.get("x-vercel-ip-country") ?? headers?.get("cf-ipcountry") ?? null;

  if (header && header !== "XX") {
    return { country: header.toUpperCase(), city: null };
  }
  return EMPTY;
}
