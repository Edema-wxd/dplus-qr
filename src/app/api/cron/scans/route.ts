import { connection } from "next/server";
import { env } from "@/lib/env";
import { pruneScans, rollupScans } from "@/lib/rollup";

/**
 * Nightly maintenance: roll scans up, then prune what retention no longer
 * covers. The order is the whole point and is enforced here rather than left
 * to a scheduler -- pruning before rolling up destroys history permanently.
 *
 * Protected by a shared secret rather than a session, because the caller is a
 * scheduler and not a person. Vercel's cron sends `Authorization: Bearer
 * $CRON_SECRET`; the same header works from curl for a manual run.
 *
 * Returns 404 rather than 401 when the secret is wrong or missing. An
 * unauthenticated prober learns nothing about whether this path exists.
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
    const rolled = await rollupScans();
    const pruned = await pruneScans();

    return Response.json(
      { ok: true, rolled, pruned },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[cron] scan maintenance failed", error);
    // Reported rather than thrown: a scheduler reads the status code, and a
    // 500 with no body tells whoever is paged nothing about which half failed.
    return Response.json(
      { ok: false, error: "scan maintenance failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
