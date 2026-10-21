import { createNeonAuth } from "@neondatabase/auth/next/server";
import { required } from "@/lib/env";

/**
 * Neon Managed Better Auth.
 *
 * Accounts, sessions, email verification and password reset are all handled by
 * the managed service in the `neon_auth` schema of the same branch, which means
 * auth state branches with the database. It also sends its own verification and
 * reset email, so none of that needs Resend.
 *
 * `required()` rather than `!` so a missing variable names itself instead of
 * failing later as an opaque fetch error.
 */
export const auth = createNeonAuth({
  baseUrl: required("NEON_AUTH_BASE_URL"),
  cookies: { secret: required("NEON_AUTH_COOKIE_SECRET") },
});
