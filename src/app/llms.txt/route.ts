import { connection } from "next/server";
import { listPublicPlans } from "@/lib/plans";
import { groupTiers, type Tier } from "@/lib/plan-tiers";
import { llmsTxt } from "@/lib/llms-txt";

/**
 * Serves /llms.txt, read per request so its prices are the ones checkout
 * charges. A failed plan read still serves the file, minus the figures.
 *
 * `llms` is in RESERVED_CODES, and a generated code never contains a dot, so
 * this path cannot collide with a printed code.
 */
export async function GET() {
  await connection();
  let tiers: Tier[] | null = null;
  try {
    tiers = groupTiers(await listPublicPlans());
  } catch {
    tiers = null;
  }
  return new Response(llmsTxt(tiers), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
