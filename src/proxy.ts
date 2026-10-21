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
 */
export default auth.middleware({ loginUrl: "/auth/sign-in" });

export const config = {
  matcher: ["/account/:path*", "/app/:path*"],
};
