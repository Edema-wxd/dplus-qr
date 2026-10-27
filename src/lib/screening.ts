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

/**
 * Hosts this platform serves codes on. A printed code can never change host,
 * so retired hosts stay listed forever.
 */
const OWN_HOSTS = new Set([
  "qriateplus.com",
  "qr.de-signplus.com",
  "dplus-qr.vercel.app",
]);

export type ScreenResult =
  | { ok: true; normalised: string }
  | { ok: false; reason: string };

function isIpHost(host: string): boolean {
  // IPv4, or any bracketed IPv6 literal.
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[");
}

/**
 * Let people type what they would say aloud: `google.com`, `www.shop.co/sale`.
 *
 * A value with no scheme gets `https://`. The guard against `mailto:x@y.z` is
 * the point of the regex: a scheme followed by anything but a port number is a
 * scheme, not a host, and prefixing it would turn `mailto:a@evil.com` into a
 * link whose host is `evil.com`. Those are left alone to fail the protocol
 * check, exactly as before.
 */
function withScheme(raw: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(raw)) return raw;
  return `https://${raw.replace(/^\/\//, "")}`;
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

  if (/\s/.test(raw)) {
    return { ok: false, reason: "That link has spaces in it. Check for a typo." };
  }

  let url: URL;
  try {
    url = new URL(withScheme(raw));
  } catch {
    return { ok: false, reason: "That does not look like a link. Try something like example.com" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "Only https:// and http:// links can be used." };
  }

  // `https://paystack.com@evil.ng/login` visits evil.ng: everything before the
  // `@` is a username, and it is there only to make the link read as another
  // site. No legitimate destination needs credentials in a printed code, so
  // any userinfo at all is refused rather than judged.
  if (url.username || url.password) {
    return {
      ok: false,
      reason: "Links with a name and @ before the domain cannot be used. Link straight to the site.",
    };
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

  // A code pointing at a host we serve codes on would loop, or chain one code
  // to another and defeat screening. Every host that has ever served codes
  // belongs here, not just the current one: codes printed against an older
  // host keep resolving for years.
  if (OWN_HOSTS.has(host) || OWN_HOSTS.has(host.replace(/^www\./, ""))) {
    return { ok: false, reason: "A code cannot point at another code." };
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
