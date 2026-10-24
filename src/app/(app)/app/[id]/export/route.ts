import { auth } from "@/lib/auth/server";
import { getCode, scanRows } from "@/lib/user-codes";

/** RFC 4180: double the quotes, wrap anything that could break a column. */
function csvCell(value: string | null): string {
  const text = value ?? "";
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Scan history for one code as CSV.
 *
 * Deliberately excludes `ip_hash`. It is a salted daily hash and not an
 * address, but exporting it would hand out a per-day pseudonymous identifier
 * for the owner's customers, which is more than they need and more than we
 * should circulate.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: session } = await auth.getSession();
  if (!session?.user) return new Response("Not signed in", { status: 401 });

  const code = await getCode(session.user.id, id);
  if (!code) return new Response("Not found", { status: 404 });

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
