import { connection } from "next/server";
import { env } from "@/lib/env";
import { recheckDestinations } from "@/lib/reputation-sweep";

/**
 * The weekly safety check (`recheckDestinations`): every code in service is
 * looked up on Google Web Risk again, and one now listed as unsafe is blocked,
 * its owner emailed and staff alerted. Does nothing until `WEB_RISK_API_KEY`
 * is set, and says so.
 *
 * Protected like the other crons: `Authorization: Bearer $CRON_SECRET`, and a
 * 404 for anyone else, so a prober learns nothing.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  await connection();

  const secret = env().CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const result = await recheckDestinations();
    return Response.json(
      result.skipped
        ? { ok: true, skipped: "WEB_RISK_API_KEY is not set" }
        : {
            ok: true,
            codes: result.codes,
            links: result.links,
            unavailable: result.unavailable,
            blocked: result.blocked.map((b) => b.shortCode),
          },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[cron] reputation re-check failed", error);
    return Response.json(
      { ok: false, error: "reputation re-check failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
