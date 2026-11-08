import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";
import { isAdmin } from "@/lib/admin";
import { reportError } from "@/lib/error-alerts";
import {
  SESSION_DATA_COOKIE,
  SESSION_TOKEN_COOKIE,
  verifiedSessionUserId,
} from "@/lib/session-cookie";

/**
 * Route protection. In Next 16 this file is `proxy.ts`; `middleware.ts` is
 * deprecated.
 *
 * The matcher lists only the protected pages. It must never cover everything:
 * a catch-all matcher redirects CSS and JavaScript for signed-out visitors, so
 * the sign-in page itself cannot load.
 *
 * The redirect path (`/{code}`) is deliberately absent. A printed code is
 * served to the public and must never be behind a session check -- and keeping
 * it out of the matcher also keeps proxy work off the sacred path entirely.
 *
 * The middleware is built per request, not at module scope, so the build does
 * not need auth secrets. See src/lib/auth/server.ts.
 */
const LOGIN_URL = "/auth/sign-in";

const ADMIN = /^\/admin(\/|$)/;

/**
 * Where a non-staff admin request is rewritten to. Two segments, so the
 * single-segment `[code]` route cannot claim it, under an `_`-prefixed folder,
 * which the App Router never routes. Nothing can ever be served here, so Next
 * answers with the site's not-found page and a 404 status. It names nothing,
 * because `next start` echoes a rewrite's target in `x-middleware-rewrite`.
 */
const NOWHERE = "/_nowhere/404";

/**
 * A failure here fails every signed-in page, and Next does not pass a Node
 * proxy's errors to `onRequestError` (only an edge proxy's), so it is
 * reported here: alerted, then thrown on exactly as before.
 */
export default async function proxy(request: NextRequest) {
  try {
    return await guard(request);
  } catch (error) {
    await reportError(error, {
      where: "proxy",
      method: request.method,
      path: request.nextUrl.pathname,
    });
    throw error;
  }
}

async function guard(request: NextRequest) {
  const response = await auth.middleware({ loginUrl: LOGIN_URL })(request);
  if (!ADMIN.test(request.nextUrl.pathname)) return response;

  /*
    The admin is here for two things: the session refresh, and hiding.

    The refresh: Neon Auth refreshes a session when the proxy reads it, and a
    page cannot write cookies. With `/admin` outside the matcher, a refresh
    attempted by `requireStaff()` inside the page threw "Cookies can only be
    modified in a Server Action or Route Handler". Reading it here first, as
    for `/app`, absorbs it.

    The hiding: the admin must give nobody who is not staff a sign that it
    exists. A redirect to sign-in would say so. So would letting the page
    run: it streams its title and a loading screen with a 200 before
    `requireStaff()` can answer, and a page that does not exist answers 404.
    So everyone who is not staff gets exactly the response a missing page
    gets, decided here, before any byte of the admin is sent.

    `requireStaff()` stays the real guard on every page and action. This
    check only ever hides: when it cannot tell (an unreadable session cookie,
    the database not answering), the request goes on to the page as before.
  */

  // Anything but a sign-in redirect (finishing a social sign-in, say) is the
  // middleware's business.
  if (isRedirect(response) && !redirectsToLogin(response, request)) return response;

  const verdict = await staffVerdict(request, response);
  if (verdict === "not-staff") return asMissingPage(request, response);

  if (!redirectsToLogin(response, request)) return response;
  return passThrough(response);
}

type Verdict = "staff" | "not-staff" | "unknown";

async function staffVerdict(request: NextRequest, response: Response): Promise<Verdict> {
  // No session, or one the middleware has just found invalid: not staff, and
  // no database read needed to say so.
  if (!request.cookies.has(SESSION_TOKEN_COOKIE) || redirectsToLogin(response, request)) {
    return "not-staff";
  }

  const secret = process.env.NEON_AUTH_COOKIE_SECRET ?? "";
  // The middleware writes a fresh cache cookie when the old one had expired,
  // so the response's copy, if any, is the current one.
  const token = setCookieValue(response, SESSION_DATA_COOKIE) ?? request.cookies.get(SESSION_DATA_COOKIE)?.value;
  const userId = token ? verifiedSessionUserId(token, secret) : null;
  if (!userId) return "unknown";

  try {
    // From the database, never the session, so revoking takes effect at once.
    return (await isAdmin(userId)) ? "staff" : "not-staff";
  } catch (error) {
    console.error("[proxy] staff check failed; leaving it to the page", error);
    return "unknown";
  }
}

/** The response any address that is not a page gets, plus the session's cookies. */
function asMissingPage(request: NextRequest, response: Response): NextResponse {
  const missing = NextResponse.rewrite(new URL(NOWHERE, request.url));
  for (const cookie of response.headers.getSetCookie()) missing.headers.append("Set-Cookie", cookie);
  return missing;
}

/** Carry on to the page, keeping any cookie the middleware cleared. */
function passThrough(response: Response): NextResponse {
  const next = NextResponse.next();
  for (const cookie of response.headers.getSetCookie()) next.headers.append("Set-Cookie", cookie);
  return next;
}

function isRedirect(response: Response): boolean {
  return response.status >= 300 && response.status < 400 && response.headers.has("location");
}

function redirectsToLogin(response: Response, request: NextRequest): boolean {
  if (!isRedirect(response)) return false;
  return new URL(response.headers.get("location")!, request.url).pathname === LOGIN_URL;
}

/** A cookie's value as a `Set-Cookie` on the response sets it; null if absent or cleared. */
function setCookieValue(response: Response, name: string): string | null {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0 && pair.slice(0, eq).trim() === name) {
      const value = pair.slice(eq + 1).trim();
      return value === "" ? null : value;
    }
  }
  return null;
}

export const config = {
  // `/admin` is here for the session refresh and to answer non-staff with a
  // 404; see above. Its guard is still `requireStaff()`, on every request.
  matcher: ["/account/:path*", "/app/:path*", "/billing/:path*", "/admin/:path*"],
};
