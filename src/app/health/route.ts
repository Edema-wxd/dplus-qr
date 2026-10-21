import { connection } from "next/server";
import { query } from "@/lib/db";
import { redis } from "@/lib/redis";
import { storage } from "@/lib/storage";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

/**
 * Health check for the external uptime monitor.
 *
 * Returns 200 only when the redirect path could actually serve a code: the
 * database must answer. Everything else is reported but does not fail the
 * check, because redirects survive without it -- alerting on Redis or object
 * storage here would page someone for a degradation no scanner can see.
 */
type State = "ok" | "degraded" | "down";

export async function GET() {
  // This route touches no request API, so without `connection()` Next would
  // try to evaluate it during the build -- where there is no database to
  // reach. Nothing about a health check is cacheable.
  await connection();

  const checks: Record<string, State> = {};
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

  const s3 = storage();
  if (!s3) {
    checks.storage = "degraded";
  } else {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: env().QR_BUCKET }));
      checks.storage = "ok";
    } catch (error) {
      console.error("[health] storage check failed", error);
      checks.storage = "degraded";
    }
  }

  // Configuration only: reaching out to the auth service on every uptime ping
  // would add load without telling us anything a sign-in attempt would not.
  checks.auth = env().NEON_AUTH_BASE_URL && env().NEON_AUTH_COOKIE_SECRET
    ? "ok"
    : "degraded";

  const healthy = checks.database === "ok";

  return Response.json(
    {
      status: healthy ? "ok" : "down",
      branch: env().NEON_BRANCH ?? null,
      checks,
      durationMs: Date.now() - startedAt,
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
