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

/**
 * Where a signed-out admin request is rewritten to. Two segments, so the
 * single-segment `[code]` route cannot claim it, under an `_`-prefixed folder,
 * which the App Router never routes. Nothing can ever be served here, so Next
 * answers with the site's not-found page and a 404 status. It names nothing,
 * because `next start` echoes a rewrite's target in `x-middleware-rewrite`.
 */
const NOWHERE = "/_nowhere/404";

export default async function proxy(request: NextRequest) {
  const response = await auth.middleware({ loginUrl: LOGIN_URL })(request);
  if (!ADMIN.test(request.nextUrl.pathname)) return response;

  /*
    The admin is here for the session refresh, and for one answer.

    Neon Auth refreshes a session when the proxy reads it. A page can only
    read: `cookies().set` throws outside a Server Action or Route Handler. With
    `/admin` outside the matcher, a staff member whose session was due for a
    refresh had it attempted by `requireStaff()` inside the page, and the page
    failed with "Cookies can only be modified in a Server Action or Route
    Handler". Passing the request through the proxy first absorbs the refresh
    here, as it already does for `/app`.

    What the proxy must not do on the admin is redirect. A signed-out visitor
    sent to sign-in learns there is something here. Nor can the page be left
    to say no: `admin/loading.tsx` makes Next prerender a shell, so the visitor
    was sent a 200 and a "Admin" title before `requireStaff()` ran, and its 404
    only arrived inside the stream. So a signed-out request is answered here,
    before any of the admin is rendered: rewritten to a path no route serves,
    it gets the same 404 page and status as any other dead link, keeping any
    cookie the middleware cleared on the way.

    A signed-in visitor goes on to `requireStaff()`, which checks the admin role
    in the database on every request and stays the real guard.
  */
  if (!redirectsToLogin(response, request)) return response;
  const notFound = NextResponse.rewrite(new URL(NOWHERE, request.url));
  for (const cookie of response.headers.getSetCookie()) {
    notFound.headers.append("Set-Cookie", cookie);
  }
  return notFound;
}

function redirectsToLogin(response: Response, request: NextRequest): boolean {
  const location = response.headers.get("location");
  if (!location || response.status < 300 || response.status >= 400) return false;
  return new URL(location, request.url).pathname === LOGIN_URL;
}

export const config = {
  // `/admin` is here for the session refresh and to 404 a signed-out visitor;
  // see above. Its guard for everyone else is `requireStaff()`.
  matcher: ["/account/:path*", "/app/:path*", "/billing/:path*", "/admin/:path*"],
};
