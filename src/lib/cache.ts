import { redis } from "@/lib/redis";

/**
 * Destination cache for the redirect path, in three tiers:
 *
 *   1. in-process Map  -- free, ~0ms, survives only as long as the process
 *   2. Upstash Redis   -- one network hop, shared across instances
 *   3. Postgres        -- the caller's fallback, not handled here
 *
 * Tier 1 carries a persistent server (cPanel, VPS); tier 2 means a serverless
 * cold start still costs one hop rather than a database round trip. That keeps
 * the hosting decision genuinely open.
 */

const TTL_SECONDS = 60;

type Entry<T> = { value: T; expiresAt: number };

const local = new Map<string, Entry<unknown>>();

/** Bounded so a scripted sweep of random codes cannot grow the heap forever. */
const MAX_LOCAL_ENTRIES = 5_000;

function localKey(namespace: string, key: string): string {
  return `${namespace}:${key}`;
}

function setLocal<T>(namespace: string, key: string, value: T): void {
  if (local.size >= MAX_LOCAL_ENTRIES) {
    // Cheapest useful eviction: drop the oldest insertion. Map preserves
    // insertion order, so the first key is the oldest.
    const oldest = local.keys().next();
    if (!oldest.done) local.delete(oldest.value);
  }
  local.set(localKey(namespace, key), {
    value,
    expiresAt: Date.now() + TTL_SECONDS * 1000,
  });
}

function getLocal<T>(namespace: string, key: string): T | undefined {
  const hit = local.get(localKey(namespace, key));
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    local.delete(localKey(namespace, key));
    return undefined;
  }
  return hit.value as T;
}

export type CacheResult<T> = {
  value: T | null;
  /** Where the value came from, for the `/health` route and for tests. */
  source: "local" | "redis" | "origin";
};

/**
 * Read through both cache tiers, falling back to `origin`. A Redis failure is
 * logged and ignored -- never surfaced to the person scanning.
 */
export async function cached<T>(
  namespace: string,
  key: string,
  origin: () => Promise<T | null>
): Promise<CacheResult<T>> {
  const hit = getLocal<T | null>(namespace, key);
  if (hit !== undefined) return { value: hit, source: "local" };

  const client = redis();
  if (client) {
    try {
      const raw = await client.get<T | null>(`${namespace}:${key}`);
      if (raw !== null && raw !== undefined) {
        setLocal(namespace, key, raw);
        return { value: raw, source: "redis" };
      }
    } catch (error) {
      console.error("[cache] redis read failed", error);
    }
  }

  const value = await origin();

  // Negative results are cached too, so a scan of unknown codes does not
  // become a scan of the database.
  setLocal(namespace, key, value);
  if (client) {
    try {
      await client.set(`${namespace}:${key}`, value, { ex: TTL_SECONDS });
    } catch (error) {
      console.error("[cache] redis write failed", error);
    }
  }

  return { value, source: "origin" };
}

/**
 * Drop a key everywhere. Called whenever a destination is edited or a code is
 * paused or blocked, so the change is live immediately instead of waiting out
 * the TTL. In-process entries on *other* instances still expire on their own,
 * which is why the TTL is short.
 */
export async function purge(namespace: string, key: string): Promise<void> {
  local.delete(localKey(namespace, key));

  const client = redis();
  if (!client) return;
  try {
    await client.del(`${namespace}:${key}`);
  } catch (error) {
    console.error("[cache] redis purge failed", error);
  }
}

/** Test helper. */
export function clearLocalCache(): void {
  local.clear();
}
