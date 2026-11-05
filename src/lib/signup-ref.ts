/**
 * The link from a hosted page's "Powered by QRiate+" footer to sign-up.
 *
 * Kept apart from `signup-source.ts`, which reads the database, so the
 * sign-up form in the browser can import the parameter name without pulling
 * in the Postgres driver.
 */

/** The query parameter and form field that carry the referring code. */
export const SIGNUP_REF_PARAM = "from";

/** Where the footer on `/p/{code}` sends someone who wants their own code. */
export function signupLinkFor(code: string): string {
  return `/auth/sign-up?${SIGNUP_REF_PARAM}=${encodeURIComponent(code)}`;
}
