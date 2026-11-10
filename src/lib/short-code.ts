import { randomInt } from "node:crypto";
import { DEMO_CODE } from "./demo-code";

/** Base-58: no 0, O, I or l, so a code read off print is unambiguous. */
export const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export const CODE_LENGTH = 7;

const CODE_PATTERN = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

/**
 * Route names that a generated code must never equal, so a code can never
 * shadow a page on this host. Next.js matches static segments ahead of the
 * dynamic `[code]` route, so a collision would silently dead-end a printed
 * code -- the one failure this platform exists to prevent.
 *
 * Every top-level route must be here. A generated code can only collide with
 * a 7-character name, but a custom code (see `checkCustomCode`) can be any
 * word, so an unreserved `/pricing` could be claimed today and dead-end the
 * day a pricing page ships. `src/__tests__/reserved-routes.test.ts` fails the
 * suite if a route under `src/app` is missing from this set.
 */
export const RESERVED_CODES: ReadonlySet<string> = new Set([
  // The landing page's specimen. It is printed on a public page and answered
  // by the redirect path from a constant, so issuing it to an account would
  // give that account a code that never reaches their destination.
  DEMO_CODE.toLowerCase(),
  // Routes on this host, current and planned.
  "demo",
  "health",
  "paused",
  "blocked",
  "report",
  "unavail",
  "unavailable",
  "login",
  "logout",
  "signup",
  "signin",
  "verify",
  "reset",
  "account",
  "app",
  "auth",
  "admin",
  "api",
  "billing",
  "pricing",
  "privacy",
  "terms",
  "legal",
  "aup",
  "cookies",
  "refunds",
  "support",
  "static",
  "assets",
  "public",
  "favicon",
  "robots",
  "sitemap",
  // Hosted pages for page-type codes live under `/p/{code}`.
  "p",
  // Public, read-only stats links live under `/s/{token}`.
  "s",
  // Routes that only became claimable once custom codes existed.
  "acceptable-use",
  "not-found-code",
  "opengraph-image",
  "icon",
  // Words that would embarrass the brand or imply official status in a URL
  // that is printed on someone else's packaging.
  "desplus",
  "dsignpl",
  "offical",
  "support",
  "secure1",
  "paystak",
]);

/** True for a generated code: exactly 7 base-58 characters, case as issued. */
export function isValidCodeFormat(code: string): boolean {
  return CODE_PATTERN.test(code);
}

/** Bounds for a custom code an owner chooses, such as `dplus`. */
export const CUSTOM_MIN_LENGTH = 4;
export const CUSTOM_MAX_LENGTH = 30;

/**
 * A custom code: lowercase letters and digits, with single hyphens between
 * them, 4 to 30 characters. No leading, trailing or doubled hyphen, so a
 * printed link cannot hide a character at its edge or blur two into one.
 */
const CUSTOM_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){3,29}$/;

/**
 * The code a request path names, or null when it cannot be a code at all.
 *
 * A generated code is matched exactly, because base-58 is case-sensitive:
 * `Ab3kQ9x` and `ab3kq9x` are different codes. Anything else is read as a
 * custom code, which is always stored lowercase, so someone typing
 * `/DPlus` off a poster still reaches `dplus`. A 7-letter custom code typed
 * in capitals is the one case this misses, because it also looks like a
 * generated code; scanned, it always arrives exactly as printed.
 *
 * Still a format check only: a malformed path never reaches the database.
 */
export function normaliseCode(raw: string): string | null {
  if (CODE_PATTERN.test(raw)) return raw;
  const lowered = raw.toLowerCase();
  return CUSTOM_PATTERN.test(lowered) ? lowered : null;
}

/**
 * Fragments a custom code may not contain, because a link on someone's
 * flyer reading `qriateplus.com/gtbank-login` is a phishing page waiting to
 * happen, whatever it redirects to. Matched anywhere in the code. Kept to
 * fragments unlikely inside an innocent name; a misused code that slips past
 * is blocked the same way as any other abusive code.
 */
const IMPERSONATION_FRAGMENTS = [
  // Credentials and trust words.
  "login", "logon", "signin", "verify", "verification", "password", "passcode",
  "secure", "wallet", "official", "offical",
  // Payment services and banks operating in Nigeria.
  "paystack", "flutterwave", "opay", "palmpay", "moniepoint", "kuda",
  "gtbank", "gtco", "zenithbank", "firstbank", "accessbank", "ecobank",
  "stanbic", "wemabank", "polarisbank", "fidelitybank", "unionbank", "fcmb",
  // Government bodies whose names are used in scams.
  "efcc", "nimc", "jamb", "waec", "inec",
  // This platform and its parent.
  "qriate", "designplus", "desplus", "dsignplus",
];

export type CustomCodeCheck = { ok: true; code: string } | { ok: false; reason: string };

/**
 * Whether an owner may claim this custom code, and the form it is stored in.
 *
 * Format and policy only. Whether someone else already holds it is answered
 * by the unique index when the code is saved, never by checking first.
 */
export function checkCustomCode(raw: string): CustomCodeCheck {
  const code = raw.trim().toLowerCase();
  if (code.length < CUSTOM_MIN_LENGTH) {
    return { ok: false, reason: `Use at least ${CUSTOM_MIN_LENGTH} characters.` };
  }
  if (code.length > CUSTOM_MAX_LENGTH) {
    return { ok: false, reason: `Use at most ${CUSTOM_MAX_LENGTH} characters.` };
  }
  if (!CUSTOM_PATTERN.test(code)) {
    return {
      ok: false,
      reason:
        "Use lowercase letters, numbers and single hyphens, starting and ending with a letter or number.",
    };
  }
  if (isReserved(code)) {
    return { ok: false, reason: "That link is reserved by the platform. Try another." };
  }
  if (IMPERSONATION_FRAGMENTS.some((fragment) => code.includes(fragment))) {
    return {
      ok: false,
      reason:
        "That link is not allowed, because it could be mistaken for a bank, payment service, government body or sign-in page.",
    };
  }
  return { ok: true, code };
}

export function isReserved(code: string): boolean {
  return RESERVED_CODES.has(code.toLowerCase());
}

/**
 * One candidate code. Uses `randomInt` rather than `Math.random` so codes are
 * not predictable from one another, and rejects reserved words.
 *
 * Collision handling belongs to the caller: insert against the unique index on
 * `qr_codes.short_code` and retry on violation. Checking first would race.
 */
export function generateCode(): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += ALPHABET[randomInt(ALPHABET.length)];
    }
    if (!isReserved(code)) return code;
  }
}
