import { connection } from "next/server";
import { env } from "@/lib/env";
import { runRetentionSweep, sweepEnabled } from "@/lib/retention";
import { runUploadCleanup } from "@/lib/upload-cleanup";

/**
 * The nightly deletion sweeps, in order:
 *
 * 1. **Retention** (`src/lib/retention.ts`): warn accounts nearly six months
 *    lapsed, and erase those already warned.
 * 2. **Uploads** (`src/lib/upload-cleanup.ts`): queue UploadThing files no code
 *    uses, then delete everything queued, including any file an erasure in
 *    step 1 could not delete.
 *
 * Both are dry runs unless `DELETION_SWEEPS_ENABLED=true`; the response says
 * which, and what each did or would have done. Each runs whatever the other
 * did, so one failing does not stop the other.
 *
 * Same guard as the other cron routes: Vercel's cron sends
 * `Authorization: Bearer $CRON_SECRET`, and anything else gets 404, not 401,
 * so a prober learns nothing about whether this path exists.
 */
export async function GET(request: Request) {
  await connection();

  const secret = env().CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Not found", { status: 404 });
  }

  const enabled = sweepEnabled();
  const [retention, uploads] = [
    await runRetentionSweep().catch((error) => {
      console.error("[cron] retention sweep failed", error);
      return null;
    }),
    await runUploadCleanup(enabled).catch((error) => {
      console.error("[cron] upload clean-up failed", error);
      return null;
    }),
  ];

  const ok = retention !== null && uploads !== null;
  console.log("[cron] cleanup", JSON.stringify({ retention, uploads }));
  return Response.json(
    { ok, enabled, retention, uploads },
    { status: ok ? 200 : 500, headers: { "Cache-Control": "no-store" } }
  );
}
