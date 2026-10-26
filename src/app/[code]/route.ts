import { after, type NextRequest } from "next/server";
import { normaliseCode } from "@/lib/short-code";
import { DEMO_CODE, DEMO_DESTINATION } from "@/lib/demo-code";
import { lookupDestination, decide } from "@/lib/codes";
import { recordScan, scanContext } from "@/lib/scans";

/**
 * The redirect. This is the sacred path: one cached lookup, then a response.
 *
 * Rules enforced here, each from the infrastructure guidelines:
 *   - always 302, never 301 -- a 301 is cached by the browser permanently, so a
 *     later destination change would never reach anyone who already scanned
 *   - `Cache-Control: no-store`, for the same reason at every proxy in between
 *   - the scan is recorded in `after()`, never before the response
 *   - a malformed code never touches the database
 *
 * This module imports only from `@/lib`. It must never pull in dashboard or
 * component code -- see src/__tests__/redirect-isolation.test.ts, which fails
 * the build if it does.
 */

// No `dynamic = "force-dynamic"` export: Cache Components (next.config.ts)
// makes data fetching dynamic by default, and that config is incompatible with
// the route segment flag. Freshness here does not rely on either -- the
// no-store header below is what keeps a destination change reaching scanners.

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await params;

  // Cheapest possible rejection: anything that is neither a generated code
  // nor a well-formed custom one is noise (a crawler, a typo, a probe) and
  // gets the not-found page without a query. A custom code comes back
  // lowercased, the form it is stored in.
  const code = normaliseCode(raw);
  if (!code) {
    return notFound();
  }

  // The landing page's specimen, answered before anything can fail. It is a
  // real symbol on a public page, so somebody will scan it -- and it has no
  // row behind it, which sent every such scan to the not-found page. A string
  // comparison against a constant costs nothing, needs no database and cannot
  // fail, so the one code we print ourselves resolves on every deployment.
  // `RESERVED_CODES` keeps it from ever being issued to an account.
  if (code === DEMO_CODE) {
    return statusRedirect(DEMO_DESTINATION);
  }

  // A lookup failure must not reach the scanner as a crash. The database being
  // unreachable is our fault, not a reason to tell someone their printed code
  // does not exist -- which would invite them to discard the printed material.
  let destination;
  try {
    ({ destination } = await lookupDestination(code));
  } catch (error) {
    console.error("[redirect] lookup failed", error);
    return statusRedirect("/unavailable");
  }

  const decision = decide(destination);

  if (decision.kind === "redirect" && destination) {
    // Headers must be read now; they are unavailable inside `after()`.
    const context = scanContext(destination.qrId, request.headers);
    after(() => recordScan(context));

    return new Response(null, {
      status: 302,
      headers: { ...NO_STORE, Location: decision.url },
    });
  }

  // A scan that lands on a status page is still a scan worth knowing about:
  // it tells the owner their code is being used while their account is lapsed.
  if (destination) {
    const context = scanContext(destination.qrId, request.headers);
    after(() => recordScan(context));
  }

  switch (decision.kind) {
    case "paused":
      return statusRedirect(`/paused?code=${code}`);
    case "blocked":
      return statusRedirect(`/blocked?code=${code}`);
    default:
      return notFound();
  }
}

/**
 * Status pages are redirected to with a RELATIVE Location, which the client
 * resolves against the URL it actually requested.
 *
 * An absolute URL built from `request.nextUrl.origin` is wrong whenever the
 * origin the server sees differs from the one the scanner used: bound to
 * 0.0.0.0 it emitted `http://0.0.0.0:3000/paused`, which no phone can follow,
 * and behind a proxy that rewrites the host it would send scanners to an
 * internal address. A relative Location cannot be wrong this way.
 */
function statusRedirect(path: string) {
  return new Response(null, {
    status: 302,
    headers: { ...NO_STORE, Location: path },
  });
}

function notFound() {
  return statusRedirect("/not-found-code");
}
