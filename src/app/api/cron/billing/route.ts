import { connection } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { reportError } from "@/lib/error-alerts";
import { retryStuckEvents } from "@/lib/billing";
import { reconcileOverdueSubscriptions } from "@/lib/billing-reconcile";

/**
 * Daily billing backstops (DECISIONS.md, 11 November 2026), run before the
 * grace job so anything they move to `past_due` is on the clock first.
 *
 * 1. `retryStuckEvents`: Paystack events whose every attempt threw, once
 *    Paystack has stopped re-sending them.
 * 2. `reconcileOverdueSubscriptions`: paid subscriptions still active here
 *    after their period ended, read back from Paystack.
 *
 * Each runs whether or not the other failed. Protected like the other crons:
 * `Authorization: Bearer $CRON_SECRET`, and a 404 for anyone else.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  await connection();

  if (!cronAuthorized(request)) {
    return new Response("Not found", { status: 404 });
  }

  const [events, periods] = await Promise.allSettled([
    retryStuckEvents(),
    reconcileOverdueSubscriptions(),
  ]);

  for (const [name, settled] of [
    ["stuck events", events],
    ["period ends", periods],
  ] as const) {
    if (settled.status === "rejected") {
      console.error(`[cron] billing ${name} failed`, settled.reason);
      await reportError(settled.reason, { where: `cron billing (${name})` });
    }
  }

  const ok = events.status === "fulfilled" && periods.status === "fulfilled";
  return Response.json(
    {
      ok,
      events: events.status === "fulfilled" ? events.value : "failed",
      periods: periods.status === "fulfilled" ? periods.value : "failed",
    },
    { status: ok ? 200 : 500, headers: { "Cache-Control": "no-store" } }
  );
}
