import { codesQuery, scanWindows, utcDay } from "@/lib/user-codes";

/**
 * The dashboard's codes query is also a Neon Realtime live query, sealed in
 * `src/lib/live-codes.ts`. Realtime rejects non-deterministic SQL, and a
 * sealed query can only be renewed with the parameters it was sealed with, so
 * these pin the two properties that make it work live: no clock in the SQL,
 * and parameters rebuilt identically from a day.
 */

const USER = "6f1c2a0e-8a43-4d2e-9a51-3b7f0c9d1e22";

describe("codesQuery", () => {
  it("reads no clock, because a live query must be deterministic", () => {
    for (const { text } of [codesQuery(USER, "2026-10-26"), codesQuery(USER, "2026-10-26", "42")]) {
      expect(text).not.toMatch(/\bnow\s*\(|current_(date|timestamp)|clock_timestamp|localtime/i);
    }
  });

  it("filters by the session's user, as the first parameter", () => {
    const { text, params } = codesQuery(USER, "2026-10-26");
    expect(text).toMatch(/where c\.user_id = \$1::uuid/);
    expect(params[0]).toBe(USER);
  });

  it("narrows to one code only alongside the user filter", () => {
    const { text, params } = codesQuery(USER, "2026-10-26", "42");
    expect(text).toMatch(/c\.user_id = \$1::uuid and c\.id = \$5::bigint/);
    expect(params).toHaveLength(5);
    expect(params[4]).toBe("42");
  });

  it("rebuilds identical parameters for the same day, so renewals match", () => {
    expect(codesQuery(USER, "2026-10-26").params).toEqual(codesQuery(USER, "2026-10-26").params);
  });

  it("counts with count(s.id), so a code with no scans shows zero", () => {
    const { text } = codesQuery(USER, "2026-10-26");
    expect(text).not.toMatch(/count\(\*\)/);
  });
});

describe("scanWindows", () => {
  it("uses whole UTC days: today, today plus six, today plus twenty-nine", () => {
    const w = scanWindows("2026-10-26");
    expect(w.today.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(w.since7d.toISOString()).toBe("2026-10-20T00:00:00.000Z");
    expect(w.since30d.toISOString()).toBe("2026-09-27T00:00:00.000Z");
  });

  it("crosses month and year boundaries", () => {
    expect(scanWindows("2027-01-03").since7d.toISOString()).toBe("2026-12-28T00:00:00.000Z");
  });
});

describe("utcDay", () => {
  it("is the UTC date, not the local one", () => {
    expect(utcDay(new Date("2026-10-26T23:30:00-05:00"))).toBe("2026-10-27");
  });
});
