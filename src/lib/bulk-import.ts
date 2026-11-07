import { linkDestination } from "@/lib/page-content";
import { checkCustomCode } from "@/lib/short-code";
import type { LinkKind } from "@/lib/qr-types";

/**
 * Bulk creation: reading a spreadsheet of codes and deciding, row by row,
 * which can be made.
 *
 * Pure, so every rule is tested without a database. The two Server Actions
 * (`checkBulkAction`, `createBulkAction`) both call `readBatch`, and the
 * create step never trusts what the check step showed: it reads and checks
 * the whole file again.
 *
 * Every row goes through the same screening as a single code
 * (`linkDestination`, `checkCustomCode`), so a spreadsheet is not a way
 * round a rule. Link, Instagram and Facebook codes only: a page type needs
 * content and uploaded files that a CSV cannot carry (decided 7 Nov 2026).
 */

/** Rows per batch, whatever the plan's limit. */
export const BULK_MAX_ROWS = 500;

/** Bytes per file or paste, well under the 1 MB Server Action body limit. */
export const BULK_MAX_BYTES = 256 * 1024;

const NAME_MAX = 80;
const DESTINATION_MAX = 2048;

/**
 * The columns a batch may have, each with the header spellings accepted for
 * it. Matched case-insensitively, ignoring spaces, hyphens and underscores.
 */
const COLUMNS = {
  name: ["name", "codename", "label"],
  destination: ["destination", "url", "link url", "destinationurl", "website", "points to"],
  type: ["type", "kind"],
  link: ["link", "customlink", "shortlink", "shortcode"],
} as const;
type Column = keyof typeof COLUMNS;

const TYPES: Record<string, LinkKind> = {
  url: "url",
  link: "url",
  website: "url",
  web: "url",
  instagram: "instagram",
  facebook: "facebook",
};

/**
 * RFC 4180, as a spreadsheet saves it: commas, fields in double quotes when
 * they hold a comma, quote or line break, a doubled quote inside a quoted
 * field, CRLF or LF line ends, and the byte-order mark Excel puts first.
 * Returns null for a quote left open, which means the file is cut short or
 * is not a CSV.
 */
export function parseCsv(text: string): string[][] | null {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  while (i < input.length) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"' && field === "") {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (c === "\r" && input[i + 1] === "\n") i += 1;
    } else {
      field += c;
    }
    i += 1;
  }
  if (quoted) return null;
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** One data row as the owner wrote it, numbered as their spreadsheet numbers it. */
export type RawRow = {
  /** Spreadsheet row number: the header is row 1, so the first code is row 2. */
  row: number;
  name: string;
  destination: string;
  type: string;
  link: string;
};

export type ReadResult =
  | { ok: true; rows: RawRow[] }
  | { ok: false; reason: string };

function headerKey(cell: string): Column | null {
  const key = cell.trim().toLowerCase().replace(/[\s_-]+/g, "");
  for (const [column, spellings] of Object.entries(COLUMNS) as [Column, readonly string[]][]) {
    if (spellings.some((s) => s.replace(/\s+/g, "") === key)) return column;
  }
  return null;
}

/**
 * The file as rows, or why it cannot be read at all. A problem with the
 * whole file (no header, an unknown column, too many rows) stops here; a
 * problem with one row is that row's, reported by `checkRows`.
 */
export function readRows(text: string): ReadResult {
  if (new TextEncoder().encode(text).length > BULK_MAX_BYTES) {
    return { ok: false, reason: `That file is larger than ${BULK_MAX_BYTES / 1024} KB. Split it into smaller batches.` };
  }
  const table = parseCsv(text);
  if (table === null) {
    return { ok: false, reason: "That file has a quote that is never closed, so it could not be read as a CSV." };
  }

  // Blank lines are skipped wherever they are, but still counted, so row
  // numbers match what the owner sees in their spreadsheet.
  const numbered = table
    .map((cells, index) => ({ cells, row: index + 1 }))
    .filter(({ cells }) => cells.some((cell) => cell.trim() !== ""));
  if (numbered.length === 0) return { ok: false, reason: "That file is empty." };

  const [header, ...data] = numbered;
  const columns = header.cells.map(headerKey);
  const unknown = header.cells.filter((cell, i) => columns[i] === null && cell.trim() !== "");
  if (unknown.length > 0) {
    return {
      ok: false,
      reason: `The first row should name the columns: name, destination, and optionally type and link. "${unknown[0].trim().slice(0, 40)}" is not one of them.`,
    };
  }
  const seen = new Set<Column>();
  for (const column of columns) {
    if (column === null) continue;
    if (seen.has(column)) return { ok: false, reason: `The ${column} column appears twice.` };
    seen.add(column);
  }
  if (!seen.has("name") || !seen.has("destination")) {
    return { ok: false, reason: "The first row should name the columns, including name and destination." };
  }
  if (data.length === 0) return { ok: false, reason: "That file has a header but no codes under it." };
  if (data.length > BULK_MAX_ROWS) {
    return {
      ok: false,
      reason: `That file has ${data.length.toLocaleString("en-NG")} codes. A batch can have at most ${BULK_MAX_ROWS}, so split it into smaller files.`,
    };
  }

  const at = (cells: string[], column: Column) => {
    const index = columns.indexOf(column);
    return index === -1 ? "" : (cells[index] ?? "").trim();
  };
  return {
    ok: true,
    rows: data.map(({ cells, row }) => ({
      row,
      name: at(cells, "name"),
      destination: at(cells, "destination"),
      type: at(cells, "type"),
      link: at(cells, "link"),
    })),
  };
}

/** A row that can be made, normalised exactly as a single code would be. */
export type GoodRow = {
  row: number;
  ok: true;
  name: string;
  kind: LinkKind;
  /** As saved: the screened, normalised destination. */
  destination: string;
  customCode: string | null;
};

export type BadRow = {
  row: number;
  ok: false;
  name: string;
  destination: string;
  reason: string;
};

export type CheckedRow = GoodRow | BadRow;

export type CheckOptions = {
  /** Whether the plan includes custom links. */
  customLinks: boolean;
  /** What a row with a link says when the plan has no custom links. */
  customRefusal: string;
};

/** Each row on its own merits, in file order. */
export function checkRows(rows: RawRow[], options: CheckOptions): CheckedRow[] {
  const links = new Map<string, number>();
  return rows.map((raw): CheckedRow => {
    const bad = (reason: string): BadRow => ({
      row: raw.row,
      ok: false,
      name: raw.name.slice(0, NAME_MAX + 20),
      destination: raw.destination.slice(0, 200),
      reason,
    });

    if (raw.name === "") return bad("Give the code a name.");
    if (raw.name.length > NAME_MAX) return bad(`The name is longer than ${NAME_MAX} characters.`);
    if (raw.destination === "") return bad("Enter a destination link.");
    if (raw.destination.length > DESTINATION_MAX) return bad("That link is too long.");

    const kind = raw.type === "" ? "url" : TYPES[raw.type.toLowerCase()];
    if (!kind) return bad("The type should be link, instagram or facebook.");

    const screened = linkDestination(kind, raw.destination);
    if (!screened.ok) return bad(screened.reason);

    let customCode: string | null = null;
    if (raw.link !== "") {
      if (!options.customLinks) return bad(options.customRefusal);
      const checked = checkCustomCode(raw.link);
      if (!checked.ok) return bad(checked.reason);
      const earlier = links.get(checked.code);
      if (earlier !== undefined) return bad(`Row ${earlier} already asks for this link.`);
      links.set(checked.code, raw.row);
      customCode = checked.code;
    }

    return { row: raw.row, ok: true, name: raw.name, kind, destination: screened.normalised, customCode };
  });
}

/**
 * Which good rows fit the plan's free code slots: the first ones, in file
 * order (decided 7 Nov 2026: make what fits and say what did not, rather than
 * refuse the batch). The rest are reported, never quietly dropped.
 */
export function fitToSlots(rows: CheckedRow[], free: number): { create: GoodRow[]; overLimit: GoodRow[] } {
  const good = rows.filter((r): r is GoodRow => r.ok);
  const room = Math.max(0, free);
  return { create: good.slice(0, room), overLimit: good.slice(room) };
}

/**
 * A code's file name inside a batch's zip: its name made safe, then its
 * short code, which keeps every entry unique however the names repeat. Only
 * `[a-z0-9-]` survive, so no entry can hold a `/`, a `..` or anything a
 * zip tool would read as a path.
 */
export function zipEntryName(name: string, shortCode: string, ext: "svg" | "png"): string {
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  const safeCode = shortCode.replace(/[^A-Za-z0-9-]/g, "");
  return `${slug || "code"}-${safeCode}.${ext}`;
}
