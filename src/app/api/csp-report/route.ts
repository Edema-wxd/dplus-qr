import { clientIp, ipRateKey } from "@/lib/ip";
import { allowCspReport } from "@/lib/ratelimit";
import { parseReports, recordViolations } from "@/lib/csp-reports";

/**
 * Where browsers send Content Security Policy violation reports, from both
 * `report-uri` and `report-to` (see `src/lib/csp.ts`). Always answers 204:
 * a browser does nothing with the answer, and a script learns nothing.
 *
 * No session, by nature, so it is limited per visitor and reads at most
 * 32KB. Only the shape of each violation is kept (`src/lib/csp-reports.ts`).
 */

const MAX_BYTES = 32 * 1024;

const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  if (!(await allowCspReport(ipRateKey(clientIp(request.headers))))) return done();

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return done();
  const text = await request.text();
  if (text.length > MAX_BYTES) return done();

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return done();
  }
  const violations = parseReports(body);
  for (const v of violations) console.warn("[csp]", v.directive, v.blocked, "on", v.section);
  await recordViolations(violations);
  return done();
}
