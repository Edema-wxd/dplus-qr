import { createNeonAuth } from "@neondatabase/auth/next/server";
import type { NeonAuth } from "@neondatabase/auth/next/server";
import { required } from "@/lib/env";

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
 * Stands in for the auth instance so call sites read normally
 * (`auth.getSession()`, `auth.signUp.email(...)`), while construction still
 * waits for the first request.
 */
export const auth = new Proxy({} as NeonAuth, {
  get(_target, property, receiver) {
    const real = neonAuth();
    const value = Reflect.get(real as object, property, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
