import { csvCell, isTable, tableCsv } from "@/lib/csv-export";
import { isShareToken, newShareToken } from "@/lib/stat-shares";
import { canShareStats, type Entitlement } from "@/lib/entitlement";
import type { Analytics } from "@/lib/user-codes";

const data: Analytics = {
  days: [
    { day: "2026-10-27", scans: 3, unique: 2 },
    { day: "2026-10-28", scans: 1, unique: 1 },
  ],
  countries: [{ label: "NG", scans: 3 }, { label: "GH", scans: 1 }],
  devices: [{ label: "mobile", scans: 4 }],
  total: 4,
  detail: {
    os: [{ label: "Android", scans: 4 }],
    cities: [{ label: '=HYPERLINK("http://evil.example","Lagos")', scans: 1 }, { label: "Accra, GH", scans: 3 }],
    unique: 3,
    previousTotal: 0,
  },
};

describe("share tokens", () => {
  it("issues 32 URL-safe characters, never the same twice", () => {
    const a = newShareToken();
    const b = newShareToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(b);
    expect(isShareToken(a)).toBe(true);
  });

  it.each(["", "short", "a".repeat(33), "a".repeat(31) + "/", "../" + "a".repeat(29)])(
    "rejects %p before it reaches the database",
    (raw) => {
      expect(isShareToken(raw)).toBe(false);
    }
  );
});

describe("canShareStats", () => {
  const pro: Entitlement = {
    planName: "Pro",
    planSlug: "pro-monthly",
    maxCodes: 50,
    historyDays: 365,
    codesUsed: 0,
    features: { share_stats: true },
    active: true,
  };

  it("allows a plan with the flag and refuses one without, naming the plans", () => {
    expect(canShareStats(pro)).toEqual({ ok: true });
    const starter = canShareStats({ ...pro, planName: "Starter", features: {} });
    if (starter.ok) throw new Error("expected refusal");
    expect(starter.reason).toMatch(/Pro and Business/);
    expect(canShareStats(null).ok).toBe(false);
  });
});

describe("tableCsv", () => {
  it("knows its tables", () => {
    expect(isTable("cities")).toBe(true);
    expect(isTable("ip_hash")).toBe(false);
    expect(isTable(null)).toBe(false);
  });

  it("exports days with uniques only when the plan includes them", () => {
    expect(tableCsv("days", data, true).split("\r\n")).toEqual([
      "day,scans,unique_scans",
      "2026-10-27,3,2",
      "2026-10-28,1,1",
    ]);
    expect(tableCsv("days", data, false).split("\r\n")[0]).toBe("day,scans");
  });

  it("gives each share of all scans, not of the rows listed", () => {
    expect(tableCsv("countries", data, false).split("\r\n")).toEqual([
      "country,scans,percent_of_all_scans",
      "NG,3,75.0",
      "GH,1,25.0",
    ]);
  });

  it("defuses a formula smuggled in through a city name, and quotes commas", () => {
    const lines = tableCsv("cities", data, true).split("\r\n");
    expect(lines[1].startsWith(`"'=HYPERLINK`)).toBe(true);
    expect(lines[2]).toBe('"Accra, GH",3,75.0');
  });

  it("exports an empty detailed table rather than failing when detail is absent", () => {
    expect(tableCsv("os", { ...data, detail: null }, false)).toBe("os,scans,percent_of_all_scans");
  });
});

describe("csvCell", () => {
  it.each([
    ["=1+1", "'=1+1"],
    ["+1", "'+1"],
    ["-1", "'-1"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["plain", "plain"],
    [null, ""],
  ])("encodes %p as %p", (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });
});
