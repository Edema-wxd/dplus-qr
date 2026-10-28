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
    return { country: header.toUpperCase(), city: readCity(headers) };
  }
  return EMPTY;
}

/**
 * The city Vercel derives from the scanner's IP, from the same edge lookup as
 * the country, so it costs nothing and needs no licence. The privacy policy
 * already names "country and city" as what a scan keeps.
 *
 * The header is URL-encoded (`S%C3%A3o%20Paulo`). It is decoded defensively:
 * this runs for every scan, and a malformed value must yield no city, never
 * an exception. Capped and stripped of control characters because it is
 * shown back to the owner and written to a CSV.
 */
export function readCity(headers?: Headers): string | null {
  const raw = headers?.get("x-vercel-ip-city");
  if (!raw) return null;
  let city: string;
  try {
    city = decodeURIComponent(raw);
  } catch {
    return null;
  }
  city = city.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);
  return city === "" ? null : city;
}
