import { auth } from "@/lib/auth/server";
import {
  canExportCsv,
  canSeeInsights,
  chartDaysAllowed,
  getEntitlement,
} from "@/lib/entitlement";
import {
  analyticsWindow,
  codeAnalytics,
  getCode,
  parseCodeId,
  scanRows,
} from "@/lib/user-codes";
import { csvCell, DETAIL_TABLES, isTable, tableCsv } from "@/lib/csv-export";



/**
 * Scan history for one code as CSV.
 *
 * Deliberately excludes `ip_hash`. It is a salted daily hash and not an
 * address, but exporting it would hand out a per-day pseudonymous identifier
 * for the owner's customers, which is more than they need and more than we
 * should circulate.
 *
 * Export is a paid capability, and the check is here rather than only on the
 * page that links to it: a route handler is an endpoint, and a feature gate
 * that lives in a button is not a gate.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: raw } = await params;

  const { data: session } = await auth.getSession();
  if (!session?.user) return new Response("Not signed in", { status: 401 });

  const id = parseCodeId(raw);
  if (!id) return new Response("Not found", { status: 404 });

  const [code, entitlement] = await Promise.all([
    getCode(session.user.id, id),
    getEntitlement(session.user.id),
  ]);
  if (!code) return new Response("Not found", { status: 404 });

  const permitted = canExportCsv(entitlement);
  if (!permitted.ok) return new Response(permitted.reason, { status: 403 });

  const search = new URL(request.url).searchParams;
  const days = Number(search.get("days")) || 30;
  const table = search.get("table");

  // One table's figures, as the page shows them. Held to the same plan rules
  // as the page: a window beyond the plan's history, or a detailed table on a
  // plan without it, is refused here as well as never linked.
  if (table !== null) {
    if (!isTable(table)) return new Response("Unknown table", { status: 400 });
    const window = analyticsWindow(days);
    if (window > chartDaysAllowed(entitlement)) {
      return new Response("That range is longer than your plan's scan history.", { status: 403 });
    }
    const insights = canSeeInsights(entitlement);
    if (DETAIL_TABLES.has(table) && !insights) {
      return new Response("That table is not part of your plan.", { status: 403 });
    }
    const data = await codeAnalytics(session.user.id, id, window, { detail: insights });
    return csvResponse(tableCsv(table, data, insights), `${code.shortCode}-${table}-${window}d.csv`);
  }

  const rows = await scanRows(session.user.id, id, days);

  const header = "scanned_at,country,device,os,browser";
  const lines = rows.map((row) =>
    [
      row.scannedAt.toISOString(),
      csvCell(row.country),
      csvCell(row.device),
      csvCell(row.os),
      csvCell(row.browser),
    ].join(",")
  );

  return csvResponse([header, ...lines].join("\r\n"), `${code.shortCode}-scans.csv`);
}

function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
