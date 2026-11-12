import { createHash } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { env } from "@/lib/env";
import { redis } from "@/lib/redis";

/**
 * Redirect-path limiter: 300 requests per minute per IP.
 *
 * This exists to stop a scripted flood inflating a client's numbers or burning
 * the hosting CPU allowance -- not to police scanning. A busy event where many
 * phones share one NAT address must not be throttled, which is why the ceiling
 * is high.
 *
 * A limited request is still redirected (see the route); only the scan record
 * is dropped. Reliability of the printed code outranks the accuracy of a count.
 */
const REDIRECT_LIMIT = 300;

let limiter: Ratelimit | null | undefined;

function redirectLimiter(): Ratelimit | null {
  if (limiter !== undefined) return limiter;

  const client = redis();
  limiter = client
    ? new Ratelimit({
        redis: client,
        limiter: Ratelimit.slidingWindow(REDIRECT_LIMIT, "1 m"),
        prefix: "rl:redirect",
        analytics: false,
      })
    : null;

  return limiter;
}

/**
 * True when this scan should be counted. Any failure -- including Redis being
 * unreachable -- counts the scan rather than dropping it, so an outage of the
 * limiter cannot quietly zero a client's analytics.
 */
export async function shouldCountScan(ip: string | null): Promise<boolean> {
  if (!ip) return true;

  const rl = redirectLimiter();
  if (!rl) return true;

  try {
    const { success } = await rl.limit(ip);
    return success;
  } catch (error) {
    console.error("[ratelimit] check failed", error);
    return true;
  }
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * The key for a visitor whose address is unknown. They share one budget
 * rather than none: on Vercel an address is always present, so this only
 * matters if a request somehow arrives without one.
 */
const NO_ADDRESS = "no-address";

/** Most keys one instance remembers per limiter before it forgets the oldest. */
const MEMORY_KEYS = 10_000;

const memory = new Map<string, Map<string, number[]>>();

/**
 * A sliding-window count kept in this instance's memory: the fallback for the
 * session-less limiters when Redis cannot be reached. Each serverless
 * instance counts on its own, so the real ceiling is the limit times the
 * instances running, which is still a ceiling. Exported for tests.
 */
export function memoryAllow(
  name: string,
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
): boolean {
  let counts = memory.get(name);
  if (!counts) {
    counts = new Map();
    memory.set(name, counts);
  }
  const recent = (counts.get(key) ?? []).filter((at) => now - at < windowMs);
  const allowed = recent.length < limit;
  if (allowed) recent.push(now);
  counts.delete(key);
  counts.set(key, recent);
  if (counts.size > MEMORY_KEYS) counts.delete(counts.keys().next().value!);
  return allowed;
}

/**
 * Abuse-report limiter: 5 reports an hour per visitor.
 *
 * The report form is the one write on this host that takes no session -- by
 * design, because someone reporting a scam should not have to hold an account
 * -- which also makes it the one Server Action a script can call freely. Each
 * call inserts a row and sends an admin email, so without a ceiling it is a
 * way to flood both the table and the mailbox the reports are meant to reach.
 *
 * Five an hour is far above what a genuine reporter needs and far below what a
 * flood looks like. Everything else behind a session is bounded by the account
 * it needs; signing in, signing up and password resets have their own limits
 * below (`allowAuth`).
 */
const REPORT_LIMIT = 5;

let reportRl: Ratelimit | null | undefined;

function reportLimiter(): Ratelimit | null {
  if (reportRl !== undefined) return reportRl;

  const client = redis();
  reportRl = client
    ? new Ratelimit({
        redis: client,
        limiter: Ratelimit.slidingWindow(REPORT_LIMIT, "1 h"),
        prefix: "rl:report",
        analytics: false,
      })
    : null;

  return reportRl;
}

/**
 * True when this report may be accepted.
 *
 * When Redis is unreachable this falls back to a count kept by this server
 * instance (`memoryAllow`), not to allowing everything: each report writes a
 * row and emails `support@`, so an outage must not open the flood gate
 * (audit L8). A real reporter is still let through, since one person sends
 * nowhere near the limit even to a single instance.
 */
export async function allowReport(key: string | null): Promise<boolean> {
  const subject = key ?? NO_ADDRESS;
  const rl = reportLimiter();
  if (!rl) return memoryAllow("report", subject, REPORT_LIMIT, HOUR_MS);

  try {
    const { success } = await rl.limit(subject);
    return success;
  } catch (error) {
    console.error("[ratelimit] report check failed", error);
    return memoryAllow("report", subject, REPORT_LIMIT, HOUR_MS);
  }
}

/**
 * Feedback limiter: 10 answers an hour per visitor.
 *
 * The feedback form on a hosted page is, like the report form, a write with no
 * session. Ten is more than any honest customer leaves and few enough that a
 * script cannot bury an owner's real ratings.
 */
const FEEDBACK_LIMIT = 10;

let feedbackRl: Ratelimit | null | undefined;

function feedbackLimiter(): Ratelimit | null {
  if (feedbackRl !== undefined) return feedbackRl;

  const client = redis();
  feedbackRl = client
    ? new Ratelimit({
        redis: client,
        limiter: Ratelimit.slidingWindow(FEEDBACK_LIMIT, "1 h"),
        prefix: "rl:feedback",
        analytics: false,
      })
    : null;

  return feedbackRl;
}

/** Falls back to this instance's own count, like `allowReport`. */
export async function allowFeedback(key: string | null): Promise<boolean> {
  const subject = key ?? NO_ADDRESS;
  const rl = feedbackLimiter();
  if (!rl) return memoryAllow("feedback", subject, FEEDBACK_LIMIT, HOUR_MS);

  try {
    const { success } = await rl.limit(subject);
    return success;
  } catch (error) {
    console.error("[ratelimit] feedback check failed", error);
    return memoryAllow("feedback", subject, FEEDBACK_LIMIT, HOUR_MS);
  }
}

/**
 * Bulk-creation limiter: 10 batches an hour per account.
 *
 * Not the real ceiling, which is the plan's code limit, checked under a lock
 * for every batch. This only stops a script from hammering the one action
 * that screens and inserts hundreds of rows per call. Fails open like the
 * others: a Redis outage does not stop a customer making codes.
 */
const BULK_LIMIT = 10;

let bulkRl: Ratelimit | null | undefined;

function bulkLimiter(): Ratelimit | null {
  if (bulkRl !== undefined) return bulkRl;

  const client = redis();
  bulkRl = client
    ? new Ratelimit({
        redis: client,
        limiter: Ratelimit.slidingWindow(BULK_LIMIT, "1 h"),
        prefix: "rl:bulk",
        analytics: false,
      })
    : null;

  return bulkRl;
}

export async function allowBulkImport(userId: string): Promise<boolean> {
  const rl = bulkLimiter();
  if (!rl) return true;

  try {
    const { success } = await rl.limit(userId);
    return success;
  } catch (error) {
    console.error("[ratelimit] bulk check failed", error);
    return true;
  }
}

/**
 * Invite limiter: 20 invitations a day per account.
 *
 * Every invite is an email from the onboarding address, the one whose
 * reputation password resets depend on, so a script hammering the invite
 * form is the thing to stop. The seat limit is the real ceiling on members;
 * this caps the mail. Fails open like the others.
 */
const INVITE_LIMIT = 20;

let inviteRl: Ratelimit | null | undefined;

function inviteLimiter(): Ratelimit | null {
  if (inviteRl !== undefined) return inviteRl;

  const client = redis();
  inviteRl = client
    ? new Ratelimit({
        redis: client,
        limiter: Ratelimit.slidingWindow(INVITE_LIMIT, "1 d"),
        prefix: "rl:invite",
        analytics: false,
      })
    : null;

  return inviteRl;
}

export async function allowInvite(accountId: string): Promise<boolean> {
  const rl = inviteLimiter();
  if (!rl) return true;

  try {
    const { success } = await rl.limit(accountId);
    return success;
  } catch (error) {
    console.error("[ratelimit] invite check failed", error);
    return true;
  }
}

/**
 * Verification-link limiter: 5 a day per account.
 *
 * A new account's codes are held until its email is confirmed, so a person
 * whose link expired or went to spam needs a way to ask for another. Each
 * one is an email from the onboarding address, and it only ever goes to the
 * signed-in person's own address, so this caps how hard one account can lean
 * on that sender. Fails open like the others: without Redis, Neon Auth's own
 * limits still apply.
 */
const VERIFY_LIMIT = 5;

let verifyRl: Ratelimit | null | undefined;

function verifyLimiter(): Ratelimit | null {
  if (verifyRl !== undefined) return verifyRl;

  const client = redis();
  verifyRl = client
    ? new Ratelimit({
        redis: client,
        limiter: Ratelimit.slidingWindow(VERIFY_LIMIT, "1 d"),
        prefix: "rl:verify",
        analytics: false,
      })
    : null;

  return verifyRl;
}

export async function allowVerificationEmail(userId: string): Promise<boolean> {
  const rl = verifyLimiter();
  if (!rl) return true;

  try {
    const { success } = await rl.limit(userId);
    return success;
  } catch (error) {
    console.error("[ratelimit] verification check failed", error);
    return true;
  }
}

/**
 * Sign-in, sign-up and password-reset limits.
 *
 * Managed Auth has its own per-IP limit, but it never sees the visitor's IP:
 * the Neon Auth SDK calls it from this server and forwards only the cookie and
 * the origin, so every attempt arrives from Vercel's addresses. Its limit is
 * therefore keyed on infrastructure, not on whoever is guessing passwords
 * (security audit, 10 November 2026). These are the limits that see the
 * visitor.
 *
 *   - sign-in, per visitor: every attempt counts. Stops one machine running a
 *     leaked password list across many accounts.
 *   - sign-in, per account: failures only, checked before trying. Stops one
 *     account's password being guessed from many machines. Someone can use it
 *     to keep an account's sign-in shut for its window by failing on purpose;
 *     a password reset still works, and that is the usual price of the check.
 *   - sign-up, per visitor: throwaway accounts are how a free QR host gets
 *     used for phishing links.
 *   - reset, per visitor and per address: each request is an email from the
 *     onboarding address, whose reputation verification mail depends on.
 *
 * Fail open, like the others: a Redis outage must not lock everyone out.
 */
export const AUTH_LIMITS = {
  "sign-in-visitor": { limit: 30, window: "15 m" },
  "sign-in-account": { limit: 10, window: "15 m" },
  "sign-up-visitor": { limit: 5, window: "1 h" },
  "reset-visitor": { limit: 5, window: "1 h" },
  "reset-account": { limit: 3, window: "1 h" },
} as const satisfies Record<string, { limit: number; window: `${number} ${"m" | "h"}` }>;

export type AuthLimit = keyof typeof AUTH_LIMITS;

const authLimiters = new Map<AuthLimit, Ratelimit | null>();

function authLimiter(kind: AuthLimit): Ratelimit | null {
  if (authLimiters.has(kind)) return authLimiters.get(kind)!;
  const client = redis();
  const { limit, window } = AUTH_LIMITS[kind];
  const rl = client
    ? new Ratelimit({
        redis: client,
        limiter: Ratelimit.slidingWindow(limit, window),
        prefix: `rl:auth:${kind}`,
        analytics: false,
      })
    : null;
  authLimiters.set(kind, rl);
  return rl;
}

/**
 * A rate-limiting key for an email address, never the address itself: the key
 * is stored in Redis, and no address is kept there. Lowercased, so `A@b` and
 * `a@B` share one budget.
 */
export function emailRateKey(email: string): string {
  const salt = env().SCAN_IP_SALT ?? "";
  return createHash("sha256")
    .update(`ratelimit-email${email.trim().toLowerCase()}${salt}`)
    .digest("hex")
    .slice(0, 32);
}

/** Spend one attempt; true when it is allowed. A null key is not limited. */
export async function allowAuth(kind: AuthLimit, key: string | null): Promise<boolean> {
  if (!key) return true;
  const rl = authLimiter(kind);
  if (!rl) return true;
  try {
    return (await rl.limit(key)).success;
  } catch (error) {
    console.error("[ratelimit] auth check failed", kind, error);
    return true;
  }
}

/** True while attempts remain, without spending one. For failure-only limits. */
export async function authBudgetLeft(kind: AuthLimit, key: string | null): Promise<boolean> {
  if (!key) return true;
  const rl = authLimiter(kind);
  if (!rl) return true;
  try {
    return (await rl.getRemaining(key)).remaining > 0;
  } catch (error) {
    console.error("[ratelimit] auth check failed", kind, error);
    return true;
  }
}

/**
 * A limiter that counts in Redis and, when Redis cannot be reached, in this
 * instance's memory (`memoryAllow`), never allowing everything. For the costly
 * reads added after the security audit (L10), where an outage must not
 * remove the ceiling.
 */
function costLimiter(prefix: string, limit: number, minutes: number) {
  let rl: Ratelimit | null | undefined;
  return async function allow(key: string | null): Promise<boolean> {
    const subject = key ?? NO_ADDRESS;
    if (rl === undefined) {
      const client = redis();
      rl = client
        ? new Ratelimit({
            redis: client,
            limiter: Ratelimit.slidingWindow(limit, `${minutes} m`),
            prefix: `rl:${prefix}`,
            analytics: false,
          })
        : null;
    }
    if (!rl) return memoryAllow(prefix, subject, limit, minutes * 60_000);
    try {
      return (await rl.limit(subject)).success;
    } catch (error) {
      console.error(`[ratelimit] ${prefix} check failed`, error);
      return memoryAllow(prefix, subject, limit, minutes * 60_000);
    }
  };
}

/**
 * Hosted PDF fetches per visitor: 120 in 10 minutes.
 *
 * Counts only the requests that reach the server and stream the file from
 * UploadThing; repeat reads are answered by Vercel's CDN (see the document
 * route). Generous on purpose: a restaurant's guests scanning its menu on
 * the same Wi-Fi share one address, and a menu must never be refused to
 * them. A script fetching a 16MB file in a loop meets it within minutes.
 */
export const allowDocumentFetch = costLimiter("document", 120, 10);

/**
 * Batch zip downloads per account: 20 an hour.
 *
 * Each one renders up to 500 codes for as long as a minute. An owner
 * downloads a batch a few times (SVG, then PNG, then again for the printer);
 * twenty is far past that and stops a script turning the route into a CPU
 * sink.
 */
export const allowZipDownload = costLimiter("zip", 20, 60);
