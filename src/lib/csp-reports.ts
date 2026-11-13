import { redis } from "@/lib/redis";

/**
 * Content Security Policy violation reports (security audit M6, 13 November
 * 2026), counted per day so the Monday summary can say whether the
 * report-only policy in `src/lib/csp.ts` is clean enough to enforce.
 *
 * A report names the page and the blocked address, either of which can carry
 * a token in its query string (an invite link, a share link). So only the
 * shape is kept: the directive, the blocked address's origin or keyword
 * (`inline`, `eval`, `data`), and the page's first path segment. Nothing
 * else from a report is stored or logged.
 *
 * Anyone can post a report, so the counts can include invented ones; the
 * endpoint's per-visitor limit and the cap on distinct kinds bound them.
 */

export type Violation = { directive: string; blocked: string; section: string };

/** Distinct kinds kept per day; past it, new kinds are dropped, known ones still counted. */
export const MAX_KINDS_PER_DAY = 200;
/** Reports read from one request. */
const MAX_PER_REQUEST = 20;
/** Kept a little over two weeks: the summary reads seven days. */
const TTL_SECONDS = 16 * 24 * 60 * 60;

const KEYWORDS = new Set(["inline", "eval", "wasm-eval", "trusted-types-policy", "trusted-types-sink", "data", "blob", "self"]);

function clip(value: string, length: number): string {
  return value.replace(/[^\x20-\x7e]/g, "").slice(0, length);
}

/** `https://a.example/x?y` → `https://a.example`; keywords kept; anything else `other`. */
export function blockedShape(value: unknown): string {
  if (typeof value !== "string" || value === "") return "unknown";
  const word = value.replace(/^'|'$/g, "").toLowerCase();
  if (KEYWORDS.has(word)) return word;
  if (/^(data|blob):/i.test(value)) return value.slice(0, value.indexOf(":")).toLowerCase();
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "wss:" ? url.origin : clip(url.protocol, 20);
  } catch {
    return "other";
  }
}

/** `https://qriateplus.com/p/Ab3/x?t=1` → `/p`. */
export function pageSection(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  try {
    const first = new URL(value).pathname.split("/")[1] ?? "";
    return `/${clip(first, 40)}`;
  } catch {
    return "unknown";
  }
}

/** The directive's name alone: `script-src-elem 'self'` → `script-src-elem`. */
function directiveName(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  return clip(value.trim().split(/\s+/)[0] ?? "", 40).toLowerCase() || "unknown";
}

/**
 * Read a report body in either format browsers send: the older
 * `application/csp-report` (`report-uri`) or the Reporting API's
 * `application/reports+json` (`report-to`), which batches several.
 */
export function parseReports(body: unknown): Violation[] {
  const found: Violation[] = [];
  const add = (r: Record<string, unknown>) => {
    found.push({
      directive: directiveName(r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"]),
      blocked: blockedShape(r["blocked-uri"] ?? r.blockedURL),
      section: pageSection(r["document-uri"] ?? r.documentURL),
    });
  };
  if (Array.isArray(body)) {
    for (const item of body.slice(0, MAX_PER_REQUEST)) {
      if (item && typeof item === "object" && (item as { type?: unknown }).type === "csp-violation") {
        const inner = (item as { body?: unknown }).body;
        if (inner && typeof inner === "object") add(inner as Record<string, unknown>);
      }
    }
  } else if (body && typeof body === "object") {
    const inner = (body as Record<string, unknown>)["csp-report"];
    if (inner && typeof inner === "object") add(inner as Record<string, unknown>);
  }
  return found;
}

export function violationKey(v: Violation): string {
  return `${v.directive} ${v.blocked} on ${v.section}`;
}

function dayKey(at: Date): string {
  return `csp:${at.toISOString().slice(0, 10)}`;
}

/** Count these violations under today. Never throws. */
export async function recordViolations(violations: Violation[], now = new Date()): Promise<void> {
  if (violations.length === 0) return;
  const client = redis();
  if (!client) return;
  const key = dayKey(now);
  try {
    const kinds = await client.hlen(key);
    for (const v of violations) {
      const field = violationKey(v);
      if (kinds >= MAX_KINDS_PER_DAY && !(await client.hexists(key, field))) continue;
      await client.hincrby(key, field, 1);
    }
    await client.expire(key, TTL_SECONDS);
  } catch (error) {
    console.error("[csp] could not count a report", error instanceof Error ? error.name : "unknown");
  }
}

export type ViolationSummary = { total: number; top: { kind: string; count: number }[] };

/** The last `days` UTC days ending with `now`'s, or null without Redis. */
export async function violationsLastDays(days: number, now = new Date()): Promise<ViolationSummary | null> {
  const client = redis();
  if (!client) return null;
  try {
    const totals = new Map<string, number>();
    for (let i = 0; i < days; i += 1) {
      const counts = await client.hgetall<Record<string, number | string>>(
        dayKey(new Date(now.getTime() - i * 86_400_000))
      );
      for (const [kind, n] of Object.entries(counts ?? {})) totals.set(kind, (totals.get(kind) ?? 0) + Number(n));
    }
    const top = [...totals].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count);
    return { total: top.reduce((sum, t) => sum + t.count, 0), top: top.slice(0, 5) };
  } catch (error) {
    console.error("[csp] could not read report counts", error instanceof Error ? error.name : "unknown");
    return null;
  }
}
