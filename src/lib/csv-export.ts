import type { Analytics, FeedbackExportRow, Slice } from "@/lib/user-codes";

/**
 * CSV for a code's scans and feedback: the cell encoder every export uses,
 * the per-table exports that mirror what the code page shows, and the
 * response every export route sends.
 */

export function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

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
export function csvCell(value: string | null): string {
  let text = value ?? "";
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The tables a code page shows, each exportable on its own. */
export const TABLES = ["days", "countries", "devices", "os", "cities"] as const;
export type Table = (typeof TABLES)[number];
/** Tables that come from the detailed analytics, which the plan must include. */
export const DETAIL_TABLES: ReadonlySet<Table> = new Set(["os", "cities"]);

export function isTable(value: string | null): value is Table {
  return value !== null && (TABLES as readonly string[]).includes(value);
}

/**
 * One table as CSV. Labels go through `csvCell` like every other value: a
 * city comes from a request header, so it is as untrusted as a User-Agent.
 */
export function tableCsv(table: Table, data: Analytics, insights: boolean): string {
  if (table === "days") {
    // A long window is bucketed on the page, and the file matches the page:
    // a row per week or month, named by its first day. No unique column
    // there, as on the chart: daily uniques do not add up into weeks.
    if (data.bucket !== "day") {
      const header = data.bucket === "week" ? "week_starting,scans" : "month,scans";
      const lines = data.points.map((p) =>
        data.bucket === "week" ? `${p.start},${p.scans}` : `${p.start.slice(0, 7)},${p.scans}`
      );
      return [header, ...lines].join("\r\n");
    }
    const header = insights ? "day,scans,unique_scans" : "day,scans";
    const lines = data.points.map((p) =>
      insights ? `${p.start},${p.scans},${p.unique ?? 0}` : `${p.start},${p.scans}`
    );
    return [header, ...lines].join("\r\n");
  }

  const slices: Slice[] =
    table === "countries"
      ? data.countries
      : table === "devices"
        ? data.devices
        : table === "os"
          ? (data.detail?.os ?? [])
          : (data.detail?.cities ?? []);
  const column = { countries: "country", devices: "device", os: "os", cities: "city" }[table];
  const denominator = data.total || 1;
  const lines = slices.map(
    (item) =>
      `${csvCell(item.label)},${item.scans},${((item.scans / denominator) * 100).toFixed(1)}`
  );
  return [`${column},scans,percent_of_all_scans`, ...lines].join("\r\n");
}

/**
 * A feedback code's answers, with where each came from.
 *
 * City and operating system follow the code page's own rule: they are the
 * detailed analytics, so a plan without `insights` gets the file without
 * those two columns, as the days table drops `unique_scans`.
 *
 * Every text field goes through `csvCell`. The comment is typed by whoever
 * scanned the code, with no account and no screening, so it is the least
 * trusted text in any export; city and OS come from request headers, as
 * untrusted as a User-Agent. That is what stops a cell beginning `=`
 * arriving in the owner's spreadsheet as a formula. The comment is last
 * because it is the long one.
 */
export function feedbackCsv(entries: FeedbackExportRow[], insights: boolean): string {
  const header = insights
    ? "answered_at,rating,country,city,device,os,comment"
    : "answered_at,rating,country,device,comment";
  const lines = entries.map((entry) =>
    [
      entry.createdAt.toISOString(),
      String(entry.rating),
      csvCell(entry.country),
      ...(insights ? [csvCell(entry.city)] : []),
      csvCell(entry.device),
      ...(insights ? [csvCell(entry.os)] : []),
      csvCell(entry.comment),
    ].join(",")
  );
  return [header, ...lines].join("\r\n");
}

/**
 * A bulk batch's rows with problems, as a CSV the owner can fix and upload
 * again. Built in the browser from what the check step showed. Every cell is
 * the owner's own input, which is still untrusted text once a spreadsheet
 * opens it, so each goes through `csvCell` like every other export.
 */
export function problemsCsv(
  rows: { row: number; name: string; destination: string; reason: string }[]
): string {
  const lines = rows.map((r) =>
    [String(r.row), csvCell(r.name), csvCell(r.destination), csvCell(r.reason)].join(",")
  );
  return ["row,name,destination,problem", ...lines].join("\r\n");
}

/**
 * The codes a bulk batch made, for the zip and the batch page's download:
 * name, short link, destination, created. Names and destinations are the
 * owner's input and go through `csvCell`.
 */
export function batchCsv(
  codes: { name: string; link: string; destination: string; createdAt: Date }[]
): string {
  const lines = codes.map((c) =>
    [csvCell(c.name), csvCell(c.link), csvCell(c.destination), c.createdAt.toISOString()].join(",")
  );
  return ["name,link,destination,created_at", ...lines].join("\r\n");
}
