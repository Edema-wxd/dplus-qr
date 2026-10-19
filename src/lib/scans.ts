import { query } from "@/lib/db";
import { redis } from "@/lib/redis";
import { clientIp, hashIp, saltDay } from "@/lib/ip";
import { parseAgent } from "@/lib/ua";
import { lookupLocation } from "@/lib/geo";
import { shouldCountScan } from "@/lib/ratelimit";

/**
 * Scan recording. Runs inside `after()`, so the response has already gone out
 * and nothing here can delay the person scanning.
 *
 * Every step is individually guarded: a Redis outage, a malformed user agent or
 * a database hiccup logs and moves on. A tracking error must never become a
 * broken printed code.
 */

export type ScanContext = {
  qrId: number;
  /** Read during the request, before `after()` -- headers are not available inside. */
  userAgent: string | null;
  ip: string | null;
  countryHeader: string | null;
};

/** Pull everything needed off the request while it is still in scope. */
export function scanContext(qrId: number, headers: Headers): ScanContext {
  return {
    qrId,
    userAgent: headers.get("user-agent"),
    ip: clientIp(headers),
    countryHeader:
      headers.get("x-vercel-ip-country") ?? headers.get("cf-ipcountry") ?? null,
  };
}

export async function recordScan(context: ScanContext): Promise<void> {
  try {
    const counted = await shouldCountScan(context.ip);
    if (!counted) return;

    const agent = parseAgent(context.userAgent);
    const ipHash = hashIp(context.ip);
    const location = lookupLocation(
      context.ip,
      context.countryHeader
        ? new Headers({ "cf-ipcountry": context.countryHeader })
        : undefined
    );

    // Counters first: cheap, and they back the dashboard's live numbers before
    // the nightly rollup runs.
    if (!agent.isBot) {
      await bumpCounters(context.qrId, ipHash);
    }

    await query(
      `insert into qr_scans
         (qr_id, country, city, device_type, os, browser, ip_hash, is_bot)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        context.qrId,
        location.country,
        location.city,
        agent.deviceType,
        agent.os,
        agent.browser,
        ipHash,
        agent.isBot,
      ]
    );
  } catch (error) {
    console.error("[scan] record failed", error);
  }
}

async function bumpCounters(qrId: number, ipHash: string | null): Promise<void> {
  const client = redis();
  if (!client) return;

  const day = saltDay();
  try {
    const pipeline = client.pipeline();
    pipeline.incr(`scans:${qrId}:${day}`);
    // HyperLogLog: approximate unique visitors for a day at fixed memory cost.
    if (ipHash) pipeline.pfadd(`uniq:${qrId}:${day}`, ipHash);
    await pipeline.exec();
  } catch (error) {
    console.error("[scan] counter bump failed", error);
  }
}
