import { Ratelimit } from "@upstash/ratelimit";
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
 * it needs, and auth itself is rate limited by Managed Auth, not here.
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
 * Fails open, like the scan limiter: Redis being unreachable must not be the
 * reason a real abuse report about a live scam is turned away. A limiter is a
 * brake on volume, not the thing standing between us and a bad destination --
 * that is the screener and the block.
 */
export async function allowReport(key: string | null): Promise<boolean> {
  if (!key) return true;

  const rl = reportLimiter();
  if (!rl) return true;

  try {
    const { success } = await rl.limit(key);
    return success;
  } catch (error) {
    console.error("[ratelimit] report check failed", error);
    return true;
  }
}
