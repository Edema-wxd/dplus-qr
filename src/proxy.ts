import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

/**
 * Route protection and session refresh. In Next 16 this file is `proxy.ts`;
 * `middleware.ts` is deprecated.
 *
 * The matcher lists only the signed-in pages. It must never cover everything:
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

export default async function proxy(request: NextRequest) {
  const response = await auth.middleware({ loginUrl: LOGIN_URL })(request);

  // `/admin` is here for the session refresh, never for the redirect.
  //
  // Neon Auth occasionally rotates the session cookie on a session read. A
  // page cannot write cookies, so when that rotation landed on an admin
  // page's own `getSession()` it threw ("Cookies can only be modified in a
  // Server Action or Route Handler"). Running the middleware first does the
  // rotation here, as it always has for `/app`.
  //
  // But a signed-out visitor must not be sent to sign-in from `/admin`: that
  // redirect says there is something here. So for `/admin` a sign-in
  // redirect becomes "carry on", and `requireStaff()` answers everyone who is
  // not staff with the site's ordinary 404, exactly as before.
  if (isAdminPath(request.nextUrl.pathname) && isLoginRedirect(response, request)) {
    return NextResponse.next();
  }
  return response;
}

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isLoginRedirect(response: Response, request: NextRequest): boolean {
  if (response.status < 300 || response.status >= 400) return false;
  const location = response.headers.get("location");
  if (!location) return false;
  const target = new URL(location, request.url);
  return target.origin === request.nextUrl.origin && target.pathname === LOGIN_URL;
}

export const config = {
  matcher: ["/account/:path*", "/admin/:path*", "/app/:path*", "/billing/:path*"],
};
