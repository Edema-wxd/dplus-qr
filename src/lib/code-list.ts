import { z } from "zod";

/**
 * Search, filter and sort for the code list at `/app`.
 *
 * Applied to the rows `listCodes` already returned rather than pushed into
 * SQL. An account holds at most a plan's code limit (250 at the top tier), so
 * this is a few hundred rows in memory, and it keeps the account-wide totals
 * honest: they are summed from every code, while the table shows the subset.
 *
 * Read from the URL, so a filtered view is a link that can be bookmarked or
 * reloaded, and the form works with no JavaScript at all.
 */

export const CODE_SORTS = {
  newest: "Newest first",
  oldest: "Oldest first",
  name: "Name, A to Z",
  scans: "Most scans, 30 days",
} as const;
export type CodeSort = keyof typeof CODE_SORTS;

export const STATUS_FILTERS = {
  all: "Any status",
  active: "Live",
  paused: "Paused",
  blocked: "Blocked",
} as const;
export type StatusFilter = keyof typeof STATUS_FILTERS;

export type ListQuery = { q: string; status: StatusFilter; sort: CodeSort };

export const DEFAULT_LIST_QUERY: ListQuery = { q: "", status: "all", sort: "newest" };

type Params = Record<string, string | string[] | undefined>;

/** First value of a repeated parameter, as a browser sends `?q=a&q=b`. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const schema = z.object({
  q: z.string().trim().max(100).catch(""),
  status: z
    .enum(Object.keys(STATUS_FILTERS) as [StatusFilter, ...StatusFilter[]])
    .catch("all"),
  sort: z.enum(Object.keys(CODE_SORTS) as [CodeSort, ...CodeSort[]]).catch("newest"),
});

/**
 * Anything unrecognised falls back to the default for that field rather than
 * failing: a stale bookmark or a hand-edited URL shows the list, not an error.
 */
export function parseListQuery(params: Params): ListQuery {
  return schema.parse({
    q: first(params.q) ?? "",
    status: first(params.status) ?? "all",
    sort: first(params.sort) ?? "newest",
  });
}

export function isDefaultListQuery(query: ListQuery): boolean {
  return query.q === "" && query.status === "all" && query.sort === "newest";
}

type Listable = {
  name: string;
  shortCode: string;
  destinationUrl: string;
  status: string;
  createdAt: Date;
  scans30d: number;
};

export function applyListQuery<T extends Listable>(codes: T[], query: ListQuery): T[] {
  const needle = query.q.toLowerCase();

  const matched = codes.filter((code) => {
    if (query.status !== "all" && code.status !== query.status) return false;
    if (!needle) return true;
    return (
      code.name.toLowerCase().includes(needle) ||
      code.shortCode.toLowerCase().includes(needle) ||
      code.destinationUrl.toLowerCase().includes(needle)
    );
  });

  const newest = (a: T, b: T) => b.createdAt.getTime() - a.createdAt.getTime();

  const compare: Record<CodeSort, (a: T, b: T) => number> = {
    newest,
    oldest: (a, b) => -newest(a, b),
    name: (a, b) =>
      a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || newest(a, b),
    // Ties break newest first, so codes with no scans keep a stable order.
    scans: (a, b) => b.scans30d - a.scans30d || newest(a, b),
  };

  return [...matched].sort(compare[query.sort]);
}
