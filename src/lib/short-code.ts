import { randomInt } from "node:crypto";

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
 * Only 7-character names can actually collide, but the whole set is listed:
 * it is cheap, and it keeps the list truthful as routes are added.
 */
export const RESERVED_CODES: ReadonlySet<string> = new Set([
  // Routes on this host, current and planned.
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
  // Words that would embarrass the brand or imply official status in a URL
  // that is printed on someone else's packaging.
  "desplus",
  "dsignpl",
  "offical",
  "support",
  "secure1",
  "paystak",
]);

export function isValidCodeFormat(code: string): boolean {
  return CODE_PATTERN.test(code);
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
