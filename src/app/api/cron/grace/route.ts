import { connection } from "next/server";
import { env } from "@/lib/env";
import { expireGracePeriods } from "@/lib/grace";

/**
 * Daily: lapse subscriptions whose grace period has run out.
 *
 * The redirect path is not waiting on this job -- it compares `grace_until` in
 * SQL, so codes stop serving the moment grace expires either way. What this
 * does is make the lapse explicit: move the row out of `past_due`, drop the
 * cached destinations so the change lands in seconds rather than a cache
 * window, and tell the customer their codes have gone quiet.
 *
 * Same protection as the scan job, and deliberately the same shape: a shared
 * secret rather than a session, because the caller is a scheduler, and 404
 * rather than 401 so a prober learns nothing about whether this path exists.
 *
 * Idempotent by construction: the claim-and-flip statement in
 * `expireGracePeriods` leaves nothing in `past_due` for a second run to find,
 * so an overlap, a retry or a manual curl all do nothing the first run did.
 */
export async function GET(request: Request) {
  // Reads a request header, so it must never be evaluated at build time.
  await connection();

  const secret = env().CRON_SECRET;
  const offered = request.headers.get("authorization");

  if (!secret || offered !== `Bearer ${secret}`) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const result = await expireGracePeriods();

    if (result.lapsed > 0) {
      console.info(
        "[cron] grace: lapsed %d, purged %d codes, emailed %d",
        result.lapsed,
        result.codesPurged,
        result.emailed
      );
    }

    return Response.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[cron] grace expiry failed", error);
    return Response.json(
      { ok: false, error: "grace expiry failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
