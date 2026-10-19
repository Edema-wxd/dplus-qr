import { createHash } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Visitor IP, read from forwarded headers because a proxy always sits in front
 * (Namecheap APISIX + LiteSpeed today; a CDN if this moves).
 *
 * The first value in `x-forwarded-for` is the client; the rest are proxies.
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
