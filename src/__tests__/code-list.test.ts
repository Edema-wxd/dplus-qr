import {
  applyListQuery,
  DEFAULT_LIST_QUERY,
  isDefaultListQuery,
  parseListQuery,
} from "@/lib/code-list";

function code(
  name: string,
  overrides: Partial<{
    shortCode: string;
    destinationUrl: string;
    status: string;
    createdAt: Date;
    scans30d: number;
  }> = {}
) {
  return {
    name,
    shortCode: overrides.shortCode ?? name.slice(0, 7),
    destinationUrl: overrides.destinationUrl ?? `https://example.com/${name}`,
    status: overrides.status ?? "active",
    createdAt: overrides.createdAt ?? new Date("2026-10-01"),
    scans30d: overrides.scans30d ?? 0,
  };
}

const codes = [
  code("Wrap label", {
    shortCode: "Ab3kQ9x",
    createdAt: new Date("2026-10-03"),
    scans30d: 4,
  }),
  code("bottle tag", {
    shortCode: "Zz9pQ2m",
    status: "paused",
    destinationUrl: "https://shop.example.ng/bottles",
    createdAt: new Date("2026-10-02"),
    scans30d: 40,
  }),
  code("Flyer", {
    shortCode: "Kk4rT7w",
    status: "blocked",
    createdAt: new Date("2026-10-01"),
    scans30d: 4,
  }),
];

const names = (list: { name: string }[]) => list.map((c) => c.name);

describe("parseListQuery", () => {
  it("defaults when nothing is given", () => {
    expect(parseListQuery({})).toEqual(DEFAULT_LIST_QUERY);
  });

  it("reads known values", () => {
    expect(parseListQuery({ q: " wrap ", status: "paused", sort: "scans" })).toEqual({
      q: "wrap",
      status: "paused",
      sort: "scans",
    });
  });

  it("falls back field by field on anything unknown, so a stale link still shows the list", () => {
    expect(parseListQuery({ q: "x", status: "deleted", sort: "random" })).toEqual({
      q: "x",
      status: "all",
      sort: "newest",
    });
  });

  it("takes the first of a repeated parameter", () => {
    expect(parseListQuery({ status: ["paused", "active"] }).status).toBe("paused");
  });

  it("drops an absurdly long search rather than failing", () => {
    expect(parseListQuery({ q: "a".repeat(500) }).q).toBe("");
  });
});

describe("applyListQuery", () => {
  it("is newest first by default and keeps every code", () => {
    expect(names(applyListQuery(codes, DEFAULT_LIST_QUERY))).toEqual([
      "Wrap label",
      "bottle tag",
      "Flyer",
    ]);
    expect(isDefaultListQuery(DEFAULT_LIST_QUERY)).toBe(true);
  });

  it("searches name, short code and destination, ignoring case", () => {
    const q = (value: string) =>
      names(applyListQuery(codes, { ...DEFAULT_LIST_QUERY, q: value }));
    expect(q("WRAP")).toEqual(["Wrap label"]);
    expect(q("zz9p")).toEqual(["bottle tag"]);
    expect(q("shop.example.ng")).toEqual(["bottle tag"]);
    expect(q("nothing like this")).toEqual([]);
  });

  it("filters by status", () => {
    expect(
      names(applyListQuery(codes, { ...DEFAULT_LIST_QUERY, status: "blocked" }))
    ).toEqual(["Flyer"]);
  });

  it("sorts by name without regard to case", () => {
    expect(names(applyListQuery(codes, { ...DEFAULT_LIST_QUERY, sort: "name" }))).toEqual([
      "bottle tag",
      "Flyer",
      "Wrap label",
    ]);
  });

  it("sorts by scans, breaking ties newest first", () => {
    expect(names(applyListQuery(codes, { ...DEFAULT_LIST_QUERY, sort: "scans" }))).toEqual([
      "bottle tag",
      "Wrap label",
      "Flyer",
    ]);
  });

  it("sorts oldest first", () => {
    expect(
      names(applyListQuery(codes, { ...DEFAULT_LIST_QUERY, sort: "oldest" }))
    ).toEqual(["Flyer", "bottle tag", "Wrap label"]);
  });

  it("does not reorder the array it was given", () => {
    const before = names(codes);
    applyListQuery(codes, { ...DEFAULT_LIST_QUERY, sort: "name" });
    expect(names(codes)).toEqual(before);
  });
});
