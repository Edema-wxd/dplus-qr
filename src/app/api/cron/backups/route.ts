import { connection } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { reportError } from "@/lib/error-alerts";
import { checkBackups } from "@/lib/backups";

/**
 * Daily, a few hours after the nightly backup job: has a good backup landed?
 * If backups that were working have stopped, or last night's run failed,
 * staff are emailed (`checkBackups`). The backup itself runs on GitHub
 * Actions, outside this app (.github/workflows/backup.yml).
 *
 * Protected like the other crons: `Authorization: Bearer $CRON_SECRET`, and a
 * 404 for anyone else.
 */
export async function GET(request: Request) {
  await connection();

  if (!cronAuthorized(request)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const health = await checkBackups();
    return Response.json(
      {
        ok: true,
        state: health.state,
        lastOk: health.state === "never" ? null : (health.lastOk?.at.toISOString() ?? null),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[cron] backup check failed", error);
    await reportError(error, { where: "cron backups" });
    return Response.json(
      { ok: false, error: "backup check failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
