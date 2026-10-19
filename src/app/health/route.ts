import { connection } from "next/server";
import { query } from "@/lib/db";
import { redis } from "@/lib/redis";

/**
 * Health check for the external uptime monitor.
 *
 * Returns 200 only when the redirect path could actually serve a code: the
 * database must answer. Redis is reported but does not fail the check, because
 * redirects survive without it -- alerting on Redis here would page someone for
 * a degradation that no client can see.
 */
export async function GET() {
  // This route touches no request API, so without `connection()` Next would
  // try to evaluate it during the build -- where there is no database to
  // reach. Nothing about a health check is cacheable.
  await connection();

  const checks: Record<string, "ok" | "degraded" | "down"> = {};

  const startedAt = Date.now();

  try {
    await query("select 1");
    checks.database = "ok";
  } catch (error) {
    console.error("[health] database check failed", error);
    checks.database = "down";
  }

  const client = redis();
  if (!client) {
    checks.redis = "degraded";
  } else {
    try {
      await client.ping();
      checks.redis = "ok";
    } catch (error) {
      console.error("[health] redis check failed", error);
      checks.redis = "degraded";
    }
  }

  const healthy = checks.database === "ok";

  return Response.json(
    { status: healthy ? "ok" : "down", checks, durationMs: Date.now() - startedAt },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
