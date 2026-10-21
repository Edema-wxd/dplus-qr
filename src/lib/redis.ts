import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

let cached: Redis | null | undefined;

/**
 * Upstash client, or null when credentials are absent. Every caller must treat
 * null as "carry on without Redis" -- a cache or counter is never a reason to
 * fail a redirect.
 */
export function redis(): Redis | null {
  if (cached !== undefined) return cached;

  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = env();
  // An empty string is how an unset-but-declared variable arrives from a
  // .env file, and it is not a usable credential.
  cached = url && token ? new Redis({ url, token }) : null;

  if (!cached && env().NODE_ENV !== "test") {
    console.warn("[redis] no credentials; using in-process cache only");
  }
  return cached;
}
