import { connection } from "next/server";
import { resolveScope } from "@/lib/resolve-scope";
import { latestTestScan, recordStepQuietly } from "@/lib/onboarding";
import { describeScan } from "@/lib/onboarding-steps";

const noStore = { "Cache-Control": "private, no-store" };

/**
 * Has the onboarding's code been scanned yet? Polled by the test-scan screen
 * while it is open.
 *
 * `proxy.ts` covers `/app/:path*`, but the session is checked again here: a
 * matcher protects pages, not data. The scope comes from the session, and
 * `latestTestScan` answers only in the person's own account and proves
 * access in its one statement, so only their own onboarding code can answer.
 * It reads the scan rows the redirect has already written in `after()`.
 * Nothing about the redirect path changes to make this work.
 *
 * The first scan it sees is the onboarding's "scanned it" step.
 */
export async function GET() {
  // Before the session read: a route that touches no request API is
  // evaluated at build time, and the build holds no auth secrets.
  await connection();
  const scope = await resolveScope();
  if (!scope) {
    return Response.json({ error: "Not signed in" }, { status: 401, headers: noStore });
  }

  let scan;
  try {
    scan = await latestTestScan(scope);
  } catch (error) {
    console.error("[onboarding] scan check failed", error);
    return Response.json({ scan: null }, { status: 503, headers: noStore });
  }

  if (!scan) return Response.json({ scan: null }, { headers: noStore });

  await recordStepQuietly(scope, "test_scanned");
  return Response.json(
    { scan: { at: scan.scannedAt.toISOString(), where: describeScan(scan) } },
    { headers: noStore }
  );
}
