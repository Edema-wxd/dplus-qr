import { connection } from "next/server";
import { env } from "@/lib/env";
import { reportError } from "@/lib/error-alerts";
import { sendWeeklySummary } from "@/lib/weekly-summary";

/**
 * Monday morning: the weekly summary email to staff (`sendWeeklySummary`).
 * Scheduled after the nightly rollup and the weekly safety check, so Sunday's
 * scans and this week's safety blocks are in it.
 *
 * Protected like the other crons: `Authorization: Bearer $CRON_SECRET`, and a
 * 404 for anyone else, so a prober learns nothing.
 */
export async function GET(request: Request) {
  await connection();

  const secret = env().CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const { sent, figures } = await sendWeeklySummary();
    return Response.json(
      {
        ok: true,
        sent,
        from: figures.from.toISOString().slice(0, 10),
        signups: figures.signups.week,
        codes: figures.codes.week,
        scans: figures.scans.week,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[cron] weekly summary failed", error);
    await reportError(error, { where: "cron summary" });
    return Response.json(
      { ok: false, error: "weekly summary failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
