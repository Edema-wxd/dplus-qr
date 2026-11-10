import { resolveScope } from "@/lib/resolve-scope";
import { canExportCsv, canSeeInsights, getEntitlement } from "@/lib/entitlement";
import { feedbackRows, getCode, parseCodeId } from "@/lib/user-codes";
import { csvResponse, feedbackCsv } from "@/lib/csv-export";

/**
 * Every answer left on a feedback code, as CSV.
 *
 * Held to the same `csv_export` gate as the scan export, checked here as well
 * as on the page: a route handler is an endpoint. City and OS columns need
 * `insights` too, as they do on the page. Any other kind of code is a 404,
 * the same answer as a code that is not this account's.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: raw } = await params;

  const scope = await resolveScope();
  if (!scope) return new Response("Not signed in", { status: 401 });

  const id = parseCodeId(raw);
  if (!id) return new Response("Not found", { status: 404 });

  const [code, entitlement] = await Promise.all([
    getCode(scope, id),
    getEntitlement(scope.accountId),
  ]);
  if (!code || code.kind !== "feedback") return new Response("Not found", { status: 404 });

  const permitted = canExportCsv(entitlement);
  if (!permitted.ok) return new Response(permitted.reason, { status: 403 });

  const entries = await feedbackRows(scope, id);
  return csvResponse(
    feedbackCsv(entries, canSeeInsights(entitlement)),
    `${code.shortCode}-feedback.csv`
  );
}
