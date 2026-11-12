import { auth } from "@/lib/auth/server";

/**
 * Same-origin proxy to Managed Auth, for what arrives by link: the email
 * verification and password-reset links, and an OAuth callback if social
 * sign-in is ever added. All of those are GETs.
 *
 * Nothing in this app writes through here. Signing in, signing up, resets and
 * signing out are Server Actions that call Managed Auth from the server, where
 * `allowAuth` (src/lib/ratelimit.ts) limits them per visitor and per account;
 * `authClient` is not used by any page. Left open, every POST endpoint of the
 * auth API (`sign-in/email`, `sign-up/email`, `request-password-reset`, ...)
 * was reachable here with none of those limits, and Managed Auth's own limit
 * cannot tell visitors apart because the SDK does not forward their IP
 * (security audit, 10 November 2026). So writes answer 404, like any address
 * that is not a page. If a browser-side auth call is ever added, open exactly
 * that path here and put the same limits in front of it.
 *
 * The OAuth verifier exchange is not affected: `proxy.ts` runs it through the
 * SDK middleware, which calls Managed Auth directly.
 *
 * GET defers to `auth.handler()` at request time rather than destructuring it
 * at module scope. Destructuring would construct the auth client while Next
 * collects route config during the build, which has no auth secrets -- see
 * src/lib/auth/server.ts.
 */
export function GET(request: Request, context: unknown): Promise<Response> {
  return (auth.handler().GET as (r: Request, c: unknown) => Promise<Response>)(request, context);
}

function refused(): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

export const POST = refused;
export const PUT = refused;
export const DELETE = refused;
export const PATCH = refused;
