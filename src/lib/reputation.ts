import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { redis } from "@/lib/redis";
import { alertOnce } from "@/lib/error-alerts";
import { allowScreeningLookups } from "@/lib/ratelimit";

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
 * Lookups are budgeted (security audit L4, 12 Nov 2026): saves go through
 * `checkLinks` / `verdictsFor`, which reuse a verdict from the last day and
 * spend the account's daily allowance (`allowScreeningLookups`) only on links
 * Google has not been asked about. A spent allowance refuses the save rather
 * than skipping the check. Google refusing lookups (quota, a bad key) emails
 * staff, because every save is then going through unscreened.
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

/** Statuses that mean Google is refusing every lookup, not just this one. */
const REFUSING: Record<number, string> = {
  429: "the lookup quota is used up",
  401: "the API key was rejected",
  403: "the API key was refused (revoked, restricted, or billing is off)",
};

/** Instances alert at most once an hour each; `alertOnce` dedupes across them. */
const alerted = new Map<number, number>();

async function alertRefusing(status: number): Promise<void> {
  const now = Date.now();
  if ((alerted.get(status) ?? 0) > now - 60 * 60 * 1000) return;
  alerted.set(status, now);
  await alertOnce(
    `web-risk:${status}`,
    `Web Risk is refusing lookups (${status})`,
    [
      `Google Web Risk answered ${status}: ${REFUSING[status]}.`,
      "",
      "Until it is fixed, links saved by customers are not checked against",
      "Google's lists of unsafe sites: saves go through, as decided on",
      "8 Nov 2026, and only the weekly re-check will catch what slipped past.",
      "",
      "Check the Web Risk API's quota and key in the Google Cloud console.",
    ].join("\n")
  );
}

/** Exported for tests. */
export function resetRefusalAlerts(): void {
  alerted.clear();
}

type Lookup = Reputation & { refusing?: boolean };

async function lookUp(url: string, key: string): Promise<Lookup> {
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
      if (response.status in REFUSING) {
        await alertRefusing(response.status);
        return { ...UNAVAILABLE, refusing: true };
      }
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

/** One link, asked of Google now: no cache and no budget. */
export async function reputationOf(url: string): Promise<Reputation> {
  const key = env().WEB_RISK_API_KEY;
  if (!key) return UNAVAILABLE;
  const { verdict, threats } = await lookUp(url, key);
  return { verdict, threats };
}

// ---------------------------------------------------------------------------
// The verdict cache.
// ---------------------------------------------------------------------------

/**
 * How long a verdict is reused: a day. A link listed since is still caught by
 * the weekly re-check, which always asks Google afresh; a link delisted since
 * waits a day to be accepted, which is the cheaper mistake.
 */
export const VERDICT_TTL_SECONDS = 24 * 60 * 60;

/** Hashed, so no customer's link is stored in Redis, and the key stays short. */
function cacheKey(url: string): string {
  return `wr:v1:${createHash("sha256").update(url).digest("hex").slice(0, 32)}`;
}

/** A stored verdict, or null for anything that is not one. */
function readVerdict(value: unknown): Reputation | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { v?: unknown; t?: unknown };
  if (record.v === "clean") return { verdict: "clean", threats: [] };
  if (record.v === "flagged" && Array.isArray(record.t)) {
    const threats = record.t.filter(isThreat);
    if (threats.length > 0) return { verdict: "flagged", threats };
  }
  return null;
}

/** Cached verdicts for these links. Any Redis failure is an empty cache. */
async function cachedVerdicts(urls: string[]): Promise<Map<string, Reputation>> {
  const found = new Map<string, Reputation>();
  const client = redis();
  if (!client || urls.length === 0) return found;
  try {
    const values = await client.mget<unknown[]>(...urls.map(cacheKey));
    urls.forEach((url, i) => {
      const verdict = readVerdict(values[i]);
      if (verdict) found.set(url, verdict);
    });
  } catch (error) {
    console.error("[reputation] verdict cache unreadable", error instanceof Error ? error.name : "unknown");
  }
  return found;
}

/** Keep Google's answers. `unavailable` is never kept: it says nothing about the link. */
async function cacheVerdicts(results: Map<string, Reputation>): Promise<void> {
  const client = redis();
  if (!client) return;
  const writes = [...results]
    .filter(([, r]) => r.verdict !== "unavailable")
    .map(([url, r]) =>
      client.set(cacheKey(url), r.verdict === "flagged" ? { v: "flagged", t: r.threats } : { v: "clean" }, {
        ex: VERDICT_TTL_SECONDS,
      })
    );
  const settled = await Promise.allSettled(writes);
  if (settled.some((s) => s.status === "rejected")) console.error("[reputation] verdict cache not written");
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

/** Ask Google about each link, a few at a time. Stops asking once Google refuses. */
async function lookUpMany(urls: string[], key: string, concurrency: number): Promise<Map<string, Reputation>> {
  const results = new Map<string, Reputation>();
  let next = 0;
  let refusing = false;
  async function worker() {
    while (next < urls.length) {
      const url = urls[next++];
      if (refusing) {
        results.set(url, UNAVAILABLE);
        continue;
      }
      const { verdict, threats, refusing: refused } = await lookUp(url, key);
      if (refused) refusing = true;
      results.set(url, { verdict, threats });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return results;
}

/**
 * Every link asked of Google afresh, with no budget, keeping the answers for
 * saves to reuse. For the weekly re-check, which must not trust a day-old
 * clean verdict and is bounded by the codes that exist.
 */
export async function reputationOfMany(
  urls: Iterable<string>,
  concurrency = 8
): Promise<Map<string, Reputation>> {
  const queue = [...new Set(urls)];
  const key = env().WEB_RISK_API_KEY;
  if (!key) return new Map(queue.map((url) => [url, UNAVAILABLE]));
  const results = await lookUpMany(queue, key, concurrency);
  await cacheVerdicts(results);
  return results;
}

/**
 * Verdicts for links an account is saving: from the cache where Google was
 * asked in the last day, and otherwise from Google, spending the account's
 * daily allowance for each link it is asked about. Null when the allowance
 * cannot cover them, which the caller refuses with `LOOKUPS_SPENT`: skipping
 * the check instead would let anyone who spends the allowance on purpose
 * save an unscreened link next (audit L4).
 */
export async function verdictsFor(
  urls: Iterable<string>,
  accountId: string,
  concurrency = 8
): Promise<Map<string, Reputation> | null> {
  const queue = [...new Set(urls)];
  const key = env().WEB_RISK_API_KEY;
  if (!key) return new Map(queue.map((url) => [url, UNAVAILABLE]));

  const results = await cachedVerdicts(queue);
  const misses = queue.filter((url) => !results.has(url));
  if (misses.length === 0) return results;
  if (!(await allowScreeningLookups(accountId, misses.length))) return null;

  const fresh = await lookUpMany(misses, key, concurrency);
  await cacheVerdicts(fresh);
  for (const [url, result] of fresh) results.set(url, result);
  return results;
}

/** What a save refused for a spent lookup allowance says. */
export const LOOKUPS_SPENT =
  "We could not check those links against Google's list of unsafe sites: this account has checked a great many new links today. Please try again tomorrow.";

export type LinkCheck = { ok: true } | { ok: false; reason: string };

/**
 * Screen the links a save is about to store. Refuses a flagged link, with a
 * sentence saying why, and a save the account's allowance cannot cover.
 * `unavailable` answers are not refusals (decided 8 Nov 2026).
 */
export async function checkLinks(urls: Iterable<string>, accountId: string): Promise<LinkCheck> {
  const results = await verdictsFor(urls, accountId);
  if (!results) return { ok: false, reason: LOOKUPS_SPENT };
  for (const [url, result] of results) {
    if (result.verdict === "flagged") return { ok: false, reason: flaggedReason(url, result.threats) };
  }
  return { ok: true };
}
