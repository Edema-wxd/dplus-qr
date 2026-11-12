import { createHash } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Visitor IP, read from forwarded headers because a proxy always sits in front.
 *
 * The first value in `x-forwarded-for` is the client; the rest are proxies.
 * That is safe on Vercel, which overwrites the header with the address it
 * saw. Behind a proxy that appends instead, the first value would be the
 * visitor's to choose, so revisit this if the app moves host.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? headers.get("cf-connecting-ip") ?? null;
}

/** UTC day, so the salt rotates at the same moment everywhere. */
export function saltDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * `sha256(ip + daily_salt)`. The raw IP is never stored or logged.
 *
 * Because the salt changes daily, unique counts work within a day but a visitor
 * cannot be followed across days -- which is the privacy promise the Privacy
 * Policy will make, so it is enforced here rather than by convention.
 *
 * Returns null when no salt is configured: scans are still recorded, just
 * without a hash, rather than silently hashing with a predictable salt.
 */
export function hashIp(ip: string | null, now: Date = new Date()): string | null {
  if (!ip) return null;

  const salt = env().SCAN_IP_SALT;
  if (!salt) return null;

  return createHash("sha256").update(`${ip}${salt}${saltDay(now)}`).digest("hex");
}

/**
 * The part of an address a limit applies to: an IPv4 address whole, an IPv6
 * address by its /64 network. One IPv6 connection is normally handed a whole
 * /64, so keying on the full address let one visitor rotate through billions
 * of keys and never meet a limit (audit L8). An IPv4-mapped IPv6 address
 * (`::ffff:1.2.3.4`) is treated as the IPv4 address it carries.
 */
export function rateSubject(ip: string): string {
  const address = ip.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  if (!address.includes(":")) return address;

  const mapped = /^(?:0{0,4}:){0,5}:?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
  if (mapped) return mapped[1];

  let groups = address.split(":");
  if (address.includes("::")) {
    const [head, tail] = address.split("::");
    const before = head ? head.split(":") : [];
    const after = tail ? tail.split(":") : [];
    const zeros = Array<string>(Math.max(0, 8 - before.length - after.length)).fill("0");
    groups = [...before, ...zeros, ...after];
  }
  const network = groups
    .slice(0, 4)
    .map((group) => (Number.parseInt(group, 16) || 0).toString(16))
    .join(":");
  return `${network}::/64`;
}

/**
 * A rate-limiting key for one visitor, derived from their IP but never equal
 * to it. IPv6 visitors are keyed by their /64 (`rateSubject`).
 *
 * A limiter has to persist its counter somewhere, and for Upstash that means
 * the key itself lands in Redis. A raw address is never stored anywhere in
 * this system, so it is hashed here for the same reason `hashIp` exists.
 *
 * Unlike `hashIp` this does not refuse to work without `SCAN_IP_SALT`:
 * declining to hash would mean declining to rate limit, which is the opposite
 * of safe. Without a salt the digest is still not an address, and the daily
 * component keeps a key from outliving the day it was issued for.
 */
export function ipRateKey(ip: string | null, now: Date = new Date()): string | null {
  if (!ip) return null;

  const salt = env().SCAN_IP_SALT ?? "";
  return createHash("sha256")
    .update(`ratelimit${rateSubject(ip)}${salt}${saltDay(now)}`)
    .digest("hex")
    .slice(0, 32);
}
