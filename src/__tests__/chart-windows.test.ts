const getSession = jest.fn();
const getCode = jest.fn();
const codeAnalytics = jest.fn();
const getEntitlement = jest.fn();

jest.mock("@/lib/resolve-scope", () => ({
  resolveScope: async () => {
    const { data } = await getSession();
    if (!data?.user) return null;
    const { scopeFor } = jest.requireActual("@/lib/account-scope");
    return scopeFor(data.user.id, data.user.id, "owner");
  },
}));
jest.mock("@/lib/user-codes", () => ({
  getCode: (...a: unknown[]) => getCode(...a),
  codeAnalytics: (...a: unknown[]) => codeAnalytics(...a),
  parseCodeId: (raw: string) => (/^\d+$/.test(raw) ? raw : null),
}));
jest.mock("@/lib/entitlement", () => {
  const actual = jest.requireActual("@/lib/entitlement");
  return { ...actual, getEntitlement: (...a: unknown[]) => getEntitlement(...a) };
});

import {
  ANALYTICS_WINDOWS,
  analyticsWindow,
  bucketFor,
  toBuckets,
  windowLabel,
  windowShortLabel,
  type DayFigures,
} from "@/lib/chart-buckets";
import { chartWindows, type Entitlement } from "@/lib/entitlement";
import {
  advertisedFeatures,
  describeFeature,
  PLAN_FEATURES,
  RETIRED_FEATURE_KEYS,
} from "@/lib/plan-features";
import { featuresFromForm } from "@/lib/plan-admin";
import { featureLines } from "@/lib/plan-tiers";
import { GET } from "@/app/(app)/app/[id]/analytics/route";

/** Every day from `first` to `last`, with `scans(day)` scans on each. */
function daysBetween(first: string, last: string, scans: (day: string) => number = () => 1): DayFigures[] {
  const out: DayFigures[] = [];
  for (let t = Date.parse(`${first}T00:00:00Z`); t <= Date.parse(`${last}T00:00:00Z`); t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push({ day, scans: scans(day), unique: 1 });
  }
  return out;
}

const entitlement = (historyDays: number, features: Entitlement["features"] = {}): Entitlement => ({
  planName: "Plan",
  planSlug: "plan",
  maxCodes: 5,
  historyDays,
  codesUsed: 0,
  features,
  active: true, seats: 1, seatsUsed: 1,
});

describe("analyticsWindow", () => {
  it("accepts the six windows and nothing else", () => {
    expect([...ANALYTICS_WINDOWS]).toEqual([7, 30, 90, 180, 365, 730]);
    for (const days of ANALYTICS_WINDOWS) expect(analyticsWindow(days)).toBe(days);
    for (const days of [181, 364, 366, 729, 731, 1e9]) expect(analyticsWindow(days)).toBe(30);
  });
});

describe("bucketFor and labels", () => {
  it("draws up to 90 days by day, 6 and 12 months by week, 24 months by month", () => {
    expect(ANALYTICS_WINDOWS.map(bucketFor)).toEqual(["day", "day", "day", "week", "week", "month"]);
  });

  it("names windows as the pricing table does, and short enough for a phone", () => {
    expect(ANALYTICS_WINDOWS.map(windowLabel)).toEqual([
      "7 days",
      "30 days",
      "90 days",
      "6 months",
      "12 months",
      "24 months",
    ]);
    expect(ANALYTICS_WINDOWS.map(windowShortLabel)).toEqual(["7d", "30d", "90d", "6m", "12m", "24m"]);
    // A plan's history is labelled the same way, and never rounded down.
    expect(windowLabel(200)).toBe("200 days");
  });
});

describe("toBuckets", () => {
  it("leaves a daily window a bar per day, uniques included", () => {
    const days = daysBetween("2026-11-01", "2026-11-07");
    const points = toBuckets(days, "day");
    expect(points).toHaveLength(7);
    expect(points[0]).toEqual({ start: "2026-11-01", end: "2026-11-01", scans: 1, unique: 1, partial: false });
  });

  it("sums weeks from Monday, so every week's bar is its days added up", () => {
    // 2025-11-08 is a Saturday, 2026-11-07 a Saturday: 365 days.
    const days = daysBetween("2025-11-08", "2026-11-07", (d) => Number(d.slice(8)));
    const points = toBuckets(days, "week");
    expect(points.reduce((sum, p) => sum + p.scans, 0)).toBe(days.reduce((sum, d) => sum + d.scans, 0));
    // A part week at each end: Sat-Sun, and Mon-Sat of the week under way.
    expect(points[0]).toMatchObject({ start: "2025-11-08", end: "2025-11-09", partial: true });
    expect(points[1]).toMatchObject({ start: "2025-11-10", end: "2025-11-16", partial: false });
    expect(points.at(-1)).toMatchObject({ start: "2026-11-02", end: "2026-11-07", partial: true });
    expect(points.every((p) => p.unique === null)).toBe(true);
    for (const p of points.slice(1, -1)) {
      expect(new Date(`${p.start}T00:00:00Z`).getUTCDay()).toBe(1);
    }
  });

  it("sums months, the first and the current one marked partial", () => {
    const days = daysBetween("2024-11-08", "2026-11-07");
    const points = toBuckets(days, "month");
    expect(points).toHaveLength(25);
    expect(points[0]).toMatchObject({ start: "2024-11-08", end: "2024-11-30", scans: 23, partial: true });
    expect(points[1]).toMatchObject({ start: "2024-12-01", end: "2024-12-31", scans: 31, partial: false });
    // 2025 is not a leap year.
    expect(points[3]).toMatchObject({ start: "2025-02-01", end: "2025-02-28", scans: 28 });
    expect(points.at(-1)).toMatchObject({ start: "2026-11-01", end: "2026-11-07", partial: true });
  });

  it("starts a long window at the code's creation, and does not call that week partial", () => {
    const days = daysBetween("2025-11-08", "2026-11-07", () => 0);
    // Created on a Wednesday three weeks ago.
    const points = toBuckets(days, "week", "2026-10-21");
    expect(points.map((p) => p.start)).toEqual(["2026-10-21", "2026-10-26", "2026-11-02"]);
    expect(points[0]).toMatchObject({ end: "2026-10-25", partial: false });
    expect(points.at(-1)!.partial).toBe(true);
  });

  it("ignores a creation day older than the window", () => {
    const days = daysBetween("2025-11-08", "2026-11-07");
    expect(toBuckets(days, "week", "2020-01-01")).toEqual(toBuckets(days, "week"));
  });

  it("keeps every day of a daily window whatever the creation day", () => {
    const days = daysBetween("2026-10-09", "2026-11-07");
    expect(toBuckets(days, "day", "2026-11-05")).toHaveLength(30);
  });
});

describe("chartWindows", () => {
  const offered = (historyDays: number) =>
    chartWindows(entitlement(historyDays)).map((w) => `${w.days}${w.locked ? " locked" : ""}`);

  it("offers every window the plan's history covers, and the next one locked", () => {
    expect(offered(30)).toEqual(["7", "30", "90 locked"]);
    expect(offered(90)).toEqual(["7", "30", "90", "180 locked"]);
    expect(offered(365)).toEqual(["7", "30", "90", "180", "365", "730 locked"]);
    expect(offered(730)).toEqual(["7", "30", "90", "180", "365", "730"]);
    expect(offered(Infinity)).toEqual(["7", "30", "90", "180", "365", "730"]);
  });

  it("offers the shortest window, and one locked, with no plan", () => {
    expect(chartWindows(null).map((w) => [w.days, w.locked])).toEqual([
      [7, false],
      [30, true],
    ]);
  });

  it("does not round a plan's history up", () => {
    expect(offered(200)).toEqual(["7", "30", "90", "180", "365 locked"]);
  });
});

describe("the retired analytics flag", () => {
  it("is not in the catalogue, and no catalogue key is retired", () => {
    const keys = PLAN_FEATURES.map((def) => def.key);
    for (const retired of RETIRED_FEATURE_KEYS) expect(keys).not.toContain(retired);
  });

  it("is never advertised or shown, but survives a plan edit", () => {
    expect(advertisedFeatures({ analytics: "trends" })).not.toContain("Trends");
    for (const def of PLAN_FEATURES) expect(describeFeature(def, "trends")).not.toBe("Trends");
    const kept = featuresFromForm(new FormData(), { analytics: "trends", csv_export: true });
    expect(kept.analytics).toBe("trends");
  });

  it("leaves the price table saying the history covers the charts too", () => {
    expect(featureLines({ maxCodes: 50, historyDays: 365, features: {} })).toContain(
      "12 months of scan history and charts"
    );
  });
});

describe("GET /app/[id]/analytics", () => {
  const call = (id: string, days: string) =>
    GET(new Request(`https://qriateplus.com/app/${id}/analytics?days=${days}`), {
      params: Promise.resolve({ id }),
    });

  beforeEach(() => {
    jest.resetAllMocks();
    getSession.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getCode.mockResolvedValue({ id: "42", shortCode: "abcdefg" });
    getEntitlement.mockResolvedValue(entitlement(365, { insights: true }));
    codeAnalytics.mockResolvedValue({ bucket: "week", points: [] });
  });

  it("refuses a signed-out request", async () => {
    getSession.mockResolvedValue({ data: null });
    expect((await call("42", "365")).status).toBe(401);
    expect(codeAnalytics).not.toHaveBeenCalled();
  });

  it("answers another account's code as a missing one", async () => {
    getCode.mockResolvedValue(null);
    expect((await call("42", "365")).status).toBe(404);
    expect((await call("nope", "365")).status).toBe(404);
    expect(codeAnalytics).not.toHaveBeenCalled();
  });

  it("serves only the long windows, and only up to the plan's history", async () => {
    expect((await call("42", "30")).status).toBe(400);
    expect((await call("42", "200")).status).toBe(400);
    expect((await call("42", "730")).status).toBe(403);
    expect(codeAnalytics).not.toHaveBeenCalled();
  });

  it("returns the window, with the detailed figures only on a plan that has them", async () => {
    const response = await call("42", "365");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ bucket: "week", points: [] });
    expect(codeAnalytics).toHaveBeenCalledWith(expect.objectContaining({ accountId: "user-1" }), "42", 365, { detail: true });

    getEntitlement.mockResolvedValue(entitlement(365));
    await call("42", "180");
    expect(codeAnalytics).toHaveBeenLastCalledWith(expect.objectContaining({ accountId: "user-1" }), "42", 180, { detail: false });
  });
});
