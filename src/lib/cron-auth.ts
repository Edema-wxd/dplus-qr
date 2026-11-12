import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * True when a request carries `Authorization: Bearer $CRON_SECRET`, as
 * Vercel's cron sends it. Every cron route answers 404 otherwise, so a prober
 * learns nothing about whether the path exists.
 *
 * Compared in constant time (security audit L13). Both sides are hashed first
 * so they are always the same length: `timingSafeEqual` throws on a length
 * mismatch, and checking length first would itself leak the secret's length.
 * With no secret configured nothing is authorised, which is how previews,
 * which hold no `CRON_SECRET`, keep their cron routes shut.
 */
export function cronAuthorized(request: Request): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return false;
  const offered = request.headers.get("authorization") ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(offered), digest(`Bearer ${secret}`));
}
