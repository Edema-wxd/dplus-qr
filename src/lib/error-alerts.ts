import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { redis } from "@/lib/redis";
import { notifyAdmin } from "@/lib/email";

/**
 * Error alerts: a server error in production emails staff, once.
 *
 * Fed by `onRequestError` in `src/instrumentation.ts` (every uncaught error in
 * a page, Route Handler, Server Action or the proxy) and by the jobs that
 * catch their own failures (the crons, the Paystack webhook), which would
 * otherwise only ever reach a log nobody reads.
 *
 * Rules (chosen 8 Nov 2026, recorded in DECISIONS.md):
 *
 * - Production only. A preview shares the production database but runs
 *   unmerged code, and its errors are its author's to read, not staff's.
 * - One email per kind of error per hour. The kind is where it happened plus
 *   the error's name and first line, with numbers and ids taken out, so the
 *   same failure on a thousand requests is one email, not a thousand.
 * - At most ten emails an hour in all, so a bad deploy cannot bury the
 *   support inbox under the alerts about itself.
 * - Every error is counted per day, for the weekly summary, whether or not it
 *   was emailed.
 * - Nothing personal leaves in the email: email addresses, IP addresses and
 *   long tokens are blanked, and the query string is dropped from the path
 *   (an invite or share link carries its token there).
 * - Never throws, and never waits long. A broken alert must not become a
 *   second error, least of all on the redirect path.
 *
 * The throttle lives in Redis so it holds across serverless instances.
 * Without Redis each instance keeps its own, which is still one email per
 * kind per instance per hour.
 */

export type ErrorSource = {
  /** Where it happened, e.g. "route /[code]" or "cron scans". */
  where: string;
  method?: string;
  /** The request path. The query string is dropped before it is used. */
  path?: string;
};

const ALERT_WINDOW_SECONDS = 60 * 60;
export const MAX_ALERTS_PER_HOUR = 10;
/** Kept a little over two weeks: the summary reads seven days. */
const COUNT_TTL_SECONDS = 16 * 24 * 60 * 60;

/** Control flow, not failure. Next filters these itself; this is a backstop. */
const CONTROL_FLOW_DIGESTS = /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/;

export type DescribedError = { name: string; message: string; digest: string | null; stack: string[] };

export function describeError(error: unknown): DescribedError {
  const digest =
    typeof error === "object" && error !== null && "digest" in error && error.digest != null
      ? String(error.digest)
      : null;
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: scrub(error.message),
      digest,
      // The first few frames, which is where the answer usually is. The full
      // stack is in the Vercel logs.
      stack: (error.stack ?? "")
        .split("\n")
        .slice(1, 7)
        .map((line) => scrub(line.trim()))
        .filter(Boolean),
    };
  }
  return { name: "Thrown value", message: scrub(String(error)), digest, stack: [] };
}

/**
 * Blank what could identify a person or unlock something: email addresses,
 * IPv4 and IPv6 addresses, and long runs of token-like characters (keys,
 * invite and share tokens, session ids). Capped at 500 characters.
 */
export function scrub(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    // IPv6, full or with "::". Not any run of colons, which would blank the
    // line numbers in a stack frame ("page.js:12:34").
    .replace(/\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b/gi, "[ip]")
    .replace(/\b(?:[0-9a-f]{1,4}:){1,7}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6}\b)?/gi, "[ip]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[token]")
    .slice(0, 500);
}

/** The path without its query string or fragment. */
export function safePath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  return scrub(path.split(/[?#]/)[0]).slice(0, 200);
}

/**
 * What makes two errors "the same" for throttling: where, the error's name and
 * its first line with every number and quoted value taken out, so a failure
 * that names a different code id each time is still one kind.
 */
export function errorSignature(source: ErrorSource, described: DescribedError): string {
  const firstLine = described.message
    .split("\n")[0]
    .replace(/"[^"]*"|'[^']*'/g, "_")
    .replace(/\d+/g, "#")
    .slice(0, 160);
  return createHash("sha256")
    .update(`${source.where}\n${described.name}\n${firstLine}`)
    .digest("hex")
    .slice(0, 16);
}

/** True for a production deployment, at run time rather than build time. */
function alertingEnabled(): boolean {
  if (process.env.NEXT_PHASE === "phase-production-build") return false;
  const e = env();
  if (e.NODE_ENV !== "production") return false;
  // VERCEL_ENV is absent off Vercel (a self-hosted production run alerts);
  // on Vercel only the production deployment does.
  return !e.VERCEL_ENV || e.VERCEL_ENV === "production";
}

function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** In-process fallback when Redis is not configured. */
const local = { until: new Map<string, number>(), hour: "", sent: 0 };

/** Resets the in-process throttle between tests. */
export function resetLocalThrottle(): void {
  local.until.clear();
  local.hour = "";
  local.sent = 0;
}

/**
 * Whether to send an alert for this key now, and record that one was. The
 * per-key hold is taken first, so of two instances racing on the same error
 * only one sends. Any Redis failure answers "send": a missed alert costs more
 * than a duplicate one.
 */
export async function claimAlert(key: string, now = new Date()): Promise<boolean> {
  const hour = now.toISOString().slice(0, 13);
  const client = redis();
  if (client) {
    try {
      const fresh = await client.set(`err:alert:${key}`, "1", { nx: true, ex: ALERT_WINDOW_SECONDS });
      if (fresh !== "OK") return false;
      const sent = await client.incr(`err:alerts:${hour}`);
      if (sent === 1) await client.expire(`err:alerts:${hour}`, 2 * ALERT_WINDOW_SECONDS);
      return sent <= MAX_ALERTS_PER_HOUR;
    } catch (error) {
      console.error("[alerts] throttle unavailable, sending anyway", error);
      return true;
    }
  }

  const held = local.until.get(key);
  if (held && held > now.getTime()) return false;
  local.until.set(key, now.getTime() + ALERT_WINDOW_SECONDS * 1000);
  if (local.hour !== hour) {
    local.hour = hour;
    local.sent = 0;
  }
  local.sent += 1;
  return local.sent <= MAX_ALERTS_PER_HOUR;
}

async function countError(now: Date): Promise<void> {
  const client = redis();
  if (!client) return;
  try {
    const key = `err:count:${utcDay(now)}`;
    const n = await client.incr(key);
    if (n === 1) await client.expire(key, COUNT_TTL_SECONDS);
  } catch (error) {
    console.error("[alerts] could not count an error", error);
  }
}

/**
 * Server errors counted over the last `days` UTC days, today included, or
 * null when there is no Redis to count in (the summary says so rather than
 * reporting a reassuring zero).
 */
export async function errorsLastDays(days: number, now = new Date()): Promise<number | null> {
  const client = redis();
  if (!client) return null;
  try {
    const keys = Array.from({ length: days }, (_, i) =>
      `err:count:${utcDay(new Date(now.getTime() - i * 86_400_000))}`
    );
    const values = await client.mget<(number | string | null)[]>(...keys);
    return values.reduce<number>((sum, v) => sum + (Number(v) || 0), 0);
  } catch (error) {
    console.error("[alerts] could not read error counts", error);
    return null;
  }
}

/** The alert email for one error. */
export function errorAlert(
  source: ErrorSource,
  described: DescribedError,
  at: Date,
  deployment?: string
): { subject: string; text: string } {
  const path = safePath(source.path);
  const headline = described.message.split("\n")[0].slice(0, 90);
  return {
    subject: `Server error in ${source.where}: ${headline || described.name}`,
    text: [
      `A server error in production, at ${at.toISOString()}.`,
      "",
      `Where: ${source.where}`,
      ...(path ? [`Request: ${source.method ?? "GET"} ${path}`] : []),
      `What: ${described.name}: ${described.message}`,
      ...(described.digest ? [`Digest: ${described.digest} (search the Vercel logs for it)`] : []),
      ...(deployment ? [`Deployment: ${deployment.slice(0, 7)}`] : []),
      ...(described.stack.length > 0 ? ["", ...described.stack] : []),
      "",
      "The same error is emailed at most once an hour, and no more than",
      `${MAX_ALERTS_PER_HOUR} alerts go out in any hour. The full stack and every`,
      "repeat are in the Vercel runtime logs.",
    ].join("\n"),
  };
}

/** Report one server error: count it and, unless throttled, email staff. */
export async function reportError(error: unknown, source: ErrorSource): Promise<void> {
  try {
    const described = describeError(error);
    if (described.digest && CONTROL_FLOW_DIGESTS.test(described.digest)) return;
    if (!alertingEnabled()) return;

    const now = new Date();
    await countError(now);
    if (!(await claimAlert(errorSignature(source, described), now))) return;
    const { subject, text } = errorAlert(source, described, now, env().VERCEL_GIT_COMMIT_SHA);
    await notifyAdmin(subject, text);
  } catch (failure) {
    console.error("[alerts] could not report an error", failure);
  }
}

/**
 * A condition that needs a person but is not an exception (a Paystack event
 * the webhook could not apply), alerted under the same throttle.
 */
export async function alertOnce(key: string, subject: string, text: string): Promise<void> {
  try {
    if (!alertingEnabled()) return;
    const hashed = createHash("sha256").update(key).digest("hex").slice(0, 16);
    if (!(await claimAlert(`note:${hashed}`))) return;
    await notifyAdmin(subject, text);
  } catch (failure) {
    console.error("[alerts] could not send an alert", failure);
  }
}
