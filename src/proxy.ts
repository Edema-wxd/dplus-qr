import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

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

export default async function proxy(request: NextRequest) {
  const response = await auth.middleware({ loginUrl: LOGIN_URL })(request);
  if (!ADMIN.test(request.nextUrl.pathname)) return response;

  /*
    The admin is here for the session refresh, not the guard.

    Neon Auth refreshes a session when the proxy reads it. A page can only
    read: `cookies().set` throws outside a Server Action or Route Handler. With
    `/admin` outside the matcher, a staff member whose session was due for a
    refresh had it attempted by `requireStaff()` inside the page, and the page
    failed with "Cookies can only be modified in a Server Action or Route
    Handler". Passing the request through the proxy first absorbs the refresh
    here, as it already does for `/app`.

    What the proxy must not do on the admin is redirect. A signed-out visitor
    sent to sign-in learns there is something here; `requireStaff()` answers
    them with the site's ordinary 404 instead. So a redirect to sign-in becomes
    a pass-through, keeping any cookie the middleware cleared on the way.
  */
  if (!redirectsToLogin(response, request)) return response;
  const passThrough = NextResponse.next();
  for (const cookie of response.headers.getSetCookie()) {
    passThrough.headers.append("Set-Cookie", cookie);
  }
  return passThrough;
}

function redirectsToLogin(response: Response, request: NextRequest): boolean {
  const location = response.headers.get("location");
  if (!location || response.status < 300 || response.status >= 400) return false;
  return new URL(location, request.url).pathname === LOGIN_URL;
}

export const config = {
  // `/admin` is here for the session refresh only; see above. Its guard is
  // `requireStaff()`, which runs on every request.
  matcher: ["/account/:path*", "/app/:path*", "/billing/:path*", "/admin/:path*"],
};
