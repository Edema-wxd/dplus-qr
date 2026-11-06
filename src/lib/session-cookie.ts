import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Who a Neon Auth session belongs to, read from its signed cache cookie.
 *
 * Neon Auth keeps a copy of the session in `session_data`: an HS256 JWT,
 * signed with our own `NEON_AUTH_COOKIE_SECRET`, whose subject is the user id
 * and which lasts at most five minutes. The proxy uses it to tell staff from
 * everyone else before a page streams (see `proxy.ts`), so it is verified here
 * with nothing but `node:crypto`: the algorithm is fixed, the signature
 * compared in constant time, the expiry enforced.
 *
 * These names and this format are Neon Auth's, not a published API. If they
 * change, verification fails and the caller treats the visitor as unknown,
 * which falls back to the page's own staff check. It can only ever stop
 * hiding the admin, never lock staff out.
 */

export const SESSION_TOKEN_COOKIE = "__Secure-neon-auth.session_token";
export const SESSION_DATA_COOKIE = "__Secure-neon-auth.local.session_data";

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function decodeJson(segment: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The user id in a valid, unexpired `session_data` token, or null. */
export function verifiedSessionUserId(token: string, secret: string, now = Date.now()): string | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !secret) return null;
  const [header, payload, signature] = parts;

  // Fixed, never read from the token: a token cannot choose a weaker check.
  if (decodeJson(header)?.alg !== "HS256") return null;

  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const claims = decodeJson(payload);
  if (!claims || typeof claims.exp !== "number" || claims.exp * 1000 <= now) return null;

  const user = claims.user as { id?: unknown } | undefined;
  const id = typeof user?.id === "string" ? user.id : claims.sub;
  return typeof id === "string" && id !== "" && id !== "anonymous" ? id : null;
}

/** Sign a token the way Neon Auth does. For tests. */
export function signSessionDataForTest(
  claims: Record<string, unknown>,
  secret: string,
  expiresAt: number
): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ ...claims, exp: Math.floor(expiresAt / 1000) }));
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
