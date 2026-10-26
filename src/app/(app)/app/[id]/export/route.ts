import { auth } from "@/lib/auth/server";
import { canExportCsv, getEntitlement } from "@/lib/entitlement";
import { getCode, parseCodeId, scanRows } from "@/lib/user-codes";

/**
 * One CSV field.
 *
 * Two separate jobs, and only the first is about CSV. RFC 4180 quoting keeps a
 * value from breaking out of its column: double the quotes, wrap anything
 * holding a quote, comma or newline.
 *
 * The leading apostrophe is about the spreadsheet that opens the file. Excel,
 * Numbers and Sheets evaluate a cell beginning `=`, `+`, `-` or `@` as a
 * formula, and these columns are not our strings -- `browser` and `os` are
 * parsed out of a User-Agent header, which is whatever the thing that scanned
 * the code chose to send. A crafted UA would otherwise arrive as a live
 * formula in the owner's spreadsheet, aimed at the one person we are handing
 * the file to. Prefixing moves it back to being text.
 */
function csvCell(value: string | null): string {
  let text = value ?? "";
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

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

  const days = Number(new URL(request.url).searchParams.get("days")) || 30;
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

  return new Response([header, ...lines].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${code.shortCode}-scans.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
