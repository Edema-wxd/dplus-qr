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
