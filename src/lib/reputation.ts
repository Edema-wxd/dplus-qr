import { env } from "@/lib/env";

/**
 * Whether a link is on Google's lists of unsafe sites, through the Web Risk
 * Lookup API (`uris.search`).
 *
 * Web Risk rather than the free Safe Browsing API, whose terms forbid
 * commercial use; the free phishing feeds are non-commercial or closed to new
 * users (decided 8 Nov 2026). The first 100,000 lookups a month are free.
 *
 * **Dormant until `WEB_RISK_API_KEY` is set**: every answer is `unavailable`,
 * and nothing anywhere behaves differently from before. With a key:
 *
 * - a destination or page link that comes back flagged is refused when it is
 *   saved, with a sentence saying why;
 * - `unavailable` (no key, Google slow or down, any error) lets the save
 *   through, because an outage at Google must never stop a customer working,
 *   and the weekly re-check catches what slipped past (decided 8 Nov 2026);
 * - the weekly re-check blocks a live code whose destination has since been
 *   flagged (`src/lib/reputation-sweep.ts`).
 *
 * Kept apart from `screening.ts`, which the page editor also runs in the
 * browser: this module holds the API key and must stay on the server. Never
 * on the redirect path: scanning a code never waits on Google.
 */

/** What is looked up. Google's names, shown to staff and mapped for owners. */
export const THREAT_TYPES = ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"] as const;
export type ThreatType = (typeof THREAT_TYPES)[number];

export type ReputationVerdict = "clean" | "flagged" | "unavailable";
export type Reputation = { verdict: ReputationVerdict; threats: ThreatType[] };

const ENDPOINT = "https://webrisk.googleapis.com/v1/uris:search";

/** Long enough for Google on a bad day, short enough that a save never feels stuck. */
const TIMEOUT_MS = 3000;

const UNAVAILABLE: Reputation = { verdict: "unavailable", threats: [] };

export function reputationConfigured(): boolean {
  return Boolean(env().WEB_RISK_API_KEY);
}

function isThreat(value: unknown): value is ThreatType {
  return (THREAT_TYPES as readonly unknown[]).includes(value);
}

export async function reputationOf(url: string): Promise<Reputation> {
  const key = env().WEB_RISK_API_KEY;
  if (!key) return UNAVAILABLE;

  const query = new URLSearchParams({ uri: url, key });
  for (const type of THREAT_TYPES) query.append("threatTypes", type);

  try {
    const response = await fetch(`${ENDPOINT}?${query}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      // The status only: the request URL carries the key.
      console.error("[reputation] Web Risk answered", response.status);
      return UNAVAILABLE;
    }
    // A clean link is an empty object; a listed one has `threat.threatTypes`.
    const body = (await response.json()) as { threat?: { threatTypes?: unknown[] } };
    const threats = (body.threat?.threatTypes ?? []).filter(isThreat);
    return threats.length > 0 ? { verdict: "flagged", threats } : { verdict: "clean", threats: [] };
  } catch (error) {
    console.error("[reputation] Web Risk lookup failed", error instanceof Error ? error.name : "unknown");
    return UNAVAILABLE;
  }
}

/** The verdict alone, for the staff re-screen button. */
export async function checkReputation(url: string): Promise<ReputationVerdict> {
  return (await reputationOf(url)).verdict;
}

/** A threat in the owner's words. */
const THREAT_WORDS: Record<ThreatType, string> = {
  SOCIAL_ENGINEERING: "phishing or a scam",
  MALWARE: "malware",
  UNWANTED_SOFTWARE: "unwanted software",
};

export function describeThreats(threats: ThreatType[]): string {
  const words = [...new Set(threats.map((t) => THREAT_WORDS[t]))];
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}` : (words[0] ?? "unsafe content");
}

/** What a save refused for a flagged link says. */
export function flaggedReason(url: string, threats: ThreatType[]): string {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url.slice(0, 80);
    }
  })();
  return `${host} is on Google's list of unsafe sites, for ${describeThreats(threats)}. Choose a different link.`;
}

/**
 * The outside links in a hosted page's content: every http(s) address in it,
 * except the files the account uploaded (which are ours, on UploadThing, and
 * were not typed by anyone). Walks the whole value rather than knowing each
 * page type's shape, like `collectFileIds`, so a new link field is covered.
 */
export function pageLinks(content: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(content)) {
    for (const item of content) pageLinks(item, into);
  } else if (content && typeof content === "object") {
    const record = content as Record<string, unknown>;
    // A file reference carries its stored URL beside the id; that is ours.
    const isFile = typeof record.fileId === "string";
    for (const [key, value] of Object.entries(record)) {
      if (isFile && key === "url") continue;
      pageLinks(value, into);
    }
  } else if (typeof content === "string" && /^https?:\/\//i.test(content)) {
    // Only the `url` beside a `fileId` is exempt (above). A typed link to any
    // UploadThing host is screened like any other: anyone can host a page on
    // `*.ufs.sh` with their own UploadThing app.
    into.add(content);
  }
  return into;
}

/**
 * Check several links, a few at a time, and return the first one flagged, if
 * any. Duplicates are looked up once. `unavailable` answers are not refusals.
 */
export async function firstFlagged(
  urls: Iterable<string>,
  concurrency = 8
): Promise<{ url: string; threats: ThreatType[] } | null> {
  const results = await reputationOfMany(urls, concurrency);
  for (const [url, result] of results) {
    if (result.verdict === "flagged") return { url, threats: result.threats };
  }
  return null;
}

export async function reputationOfMany(
  urls: Iterable<string>,
  concurrency = 8
): Promise<Map<string, Reputation>> {
  const queue = [...new Set(urls)];
  const results = new Map<string, Reputation>();
  if (!reputationConfigured()) {
    for (const url of queue) results.set(url, UNAVAILABLE);
    return results;
  }
  let next = 0;
  async function worker() {
    while (next < queue.length) {
      const url = queue[next++];
      results.set(url, await reputationOf(url));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return results;
}
