import { createNeonAuth } from "@neondatabase/auth/next/server";
import type { NeonAuth } from "@neondatabase/auth/next/server";
import { cache } from "react";
import { required } from "@/lib/env";
import { sessionIdOf, sessionIsLive } from "@/lib/auth/sessions";

/**
 * Neon Managed Better Auth.
 *
 * Accounts, sessions, email verification and password reset are all handled by
 * the managed service in the `neon_auth` schema of the same branch, which means
 * auth state branches with the database. It also sends its own verification and
 * reset email, so none of that needs Resend.
 *
 * Built on first use rather than at module load. The SDK's documented pattern
 * constructs it at module scope, but Next collects route configuration during
 * the build, which evaluates this module -- and a build has no reason to hold
 * auth secrets. Constructing eagerly made `next build` fail on Vercel, where
 * `--env` values are runtime-only.
 */
let instance: NeonAuth | null = null;

function neonAuth(): NeonAuth {
  if (!instance) {
    instance = createNeonAuth({
      baseUrl: required("NEON_AUTH_BASE_URL"),
      cookies: { secret: required("NEON_AUTH_COOKIE_SECRET") },
    });
  }
  return instance;
}

/**
 * Whether a session still exists, asked once per request per session.
 *
 * A failed read answers yes: with the database unreachable the page fails on
 * its own reads anyway, and saying no would bounce everyone to sign-in. The
 * cost is that a revoked session lasts until its cached copy expires, at
 * most five minutes, which is how sign-out behaved before.
 */
const checkLive = cache(async (sessionId: string): Promise<boolean> => {
  try {
    return await sessionIsLive(sessionId);
  } catch (error) {
    console.error("[auth] could not check the session is live; trusting the cookie", error);
    return true;
  }
});

type GetSession = NeonAuth["getSession"];

/**
 * `getSession`, refusing a session whose row has been deleted.
 *
 * The SDK answers from the device's signed cookie whenever it has one, for
 * up to five minutes, without asking whether the session still exists. That
 * is what let a signed-out phone carry on. Checking the row here covers
 * every caller at once (pages, Server Actions, Route Handlers and
 * `resolveScope`), so signing out everywhere takes effect on each device's
 * next request. See `src/lib/auth/sessions.ts`.
 */
function liveGetSession(real: NeonAuth): GetSession {
  const getSession = real.getSession.bind(real) as GetSession;
  return (async (...args: Parameters<GetSession>) => {
    const result = await getSession(...args);
    const id = sessionIdOf(result.data);
    if (id === null || (await checkLive(id))) return result;
    return { data: null, error: null };
  }) as GetSession;
}

/**
 * Stands in for the auth instance so call sites read normally
 * (`auth.getSession()`, `auth.signUp.email(...)`), while construction still
 * waits for the first request.
 */
export const auth = new Proxy({} as NeonAuth, {
  get(_target, property, receiver) {
    const real = neonAuth();
    if (property === "getSession") return liveGetSession(real);
    const value = Reflect.get(real as object, property, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
