import type { Analytics, Slice } from "@/lib/user-codes";

/**
 * CSV for a code's scans: the cell encoder every export uses, and the
 * per-table exports that mirror what the code page shows.
 */

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
    const header = insights ? "day,scans,unique_scans" : "day,scans";
    const lines = data.days.map((d) =>
      insights ? `${d.day},${d.scans},${d.unique}` : `${d.day},${d.scans}`
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
