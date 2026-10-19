/**
 * Destination screening. Phase 1-2 enforces URL rules only; the reputation
 * check is a declared interface with a stub, so Google Web Risk drops in at
 * Phase 3 once its licence and pricing are confirmed.
 */

const BLOCKED_SCHEMES = ["javascript:", "data:", "vbscript:", "file:", "blob:"];

/**
 * Other URL shorteners are refused: they hide the real target, which defeats
 * screening entirely and makes this domain a laundering step.
 */
const SHORTENER_HOSTS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "rebrand.ly",
  "cutt.ly",
  "shorturl.at",
  "rb.gy",
  "t.ly",
  "lnkd.in",
  "tiny.cc",
  "bl.ink",
]);

export type ScreenResult =
  | { ok: true; normalised: string }
  | { ok: false; reason: string };

function isIpHost(host: string): boolean {
  // IPv4, or any bracketed IPv6 literal.
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[");
}

export function screenUrl(input: string): ScreenResult {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: "Enter a destination link." };

  const lowered = raw.toLowerCase();
  for (const scheme of BLOCKED_SCHEMES) {
    if (lowered.startsWith(scheme)) {
      return { ok: false, reason: "That kind of link cannot be used." };
    }
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "That does not look like a complete link. Include https://" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "Only https:// and http:// links can be used." };
  }

  const host = url.hostname.toLowerCase();

  if (isIpHost(host)) {
    return { ok: false, reason: "Links to a bare IP address cannot be used." };
  }

  if (!host.includes(".")) {
    return { ok: false, reason: "That link has no public domain name." };
  }

  if (SHORTENER_HOSTS.has(host) || SHORTENER_HOSTS.has(host.replace(/^www\./, ""))) {
    return {
      ok: false,
      reason: "Links to other URL shorteners cannot be used. Point to the real destination.",
    };
  }

  // A code pointing at this host would loop, or chain one code to another.
  if (host === "qr.de-signplus.com") {
    return { ok: false, reason: "A code cannot point at another De Sign Plus code." };
  }

  return { ok: true, normalised: url.toString() };
}

/**
 * Reputation check. Phase 3 replaces the body with a Google Web Risk lookup
 * (threat types MALWARE, SOCIAL_ENGINEERING, UNWANTED_SOFTWARE).
 *
 * Returns `unavailable` rather than `clean` when no provider is configured, so
 * no caller can mistake "not checked" for "checked and safe".
 */
export type ReputationVerdict = "clean" | "flagged" | "unavailable";

export async function checkReputation(_url: string): Promise<ReputationVerdict> {
  return "unavailable";
}
