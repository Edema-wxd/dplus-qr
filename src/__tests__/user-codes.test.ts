import { canCreateCode, type Entitlement } from "@/lib/entitlement";
import { analyticsWindow, ANALYTICS_WINDOWS } from "@/lib/user-codes";
import { rollupWindow } from "@/lib/rollup";

/**
 * Pure logic only. Everything else in these modules is SQL, which is covered by
 * running the real migrations against a database rather than by mocking `pg`
 * into agreeing with itself.
 */

function entitlement(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    planName: "Free",
    planSlug: "free",
    maxCodes: 5,
    historyDays: 30,
    codesUsed: 0,
    active: true,
    ...overrides,
  };
}

describe("canCreateCode", () => {
  it("allows a code when the plan has room", () => {
    expect(canCreateCode(entitlement({ codesUsed: 4 }))).toEqual({ ok: true });
  });

  it("refuses at the limit, not one past it", () => {
    const result = canCreateCode(entitlement({ codesUsed: 5 }));
    expect(result.ok).toBe(false);
  });

  it("refuses an account with no plan rather than defaulting to a generous one", () => {
    const result = canCreateCode(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no active plan/i);
  });

  it("names the plan and the limit, so the message is actionable", () => {
    const result = canCreateCode(entitlement({ codesUsed: 5, maxCodes: 5 }));
    if (result.ok) throw new Error("expected refusal");
    expect(result.reason).toContain("Free");
    expect(result.reason).toContain("5");
  });

  it("holds the limit against codes of any status, since paused codes still hold their short code", () => {
    // codesUsed is counted across every status by getEntitlement's SQL; this
    // asserts the policy that the limit applies to codes held, not codes live.
    expect(canCreateCode(entitlement({ codesUsed: 5 })).ok).toBe(false);
  });
});

describe("analyticsWindow", () => {
  it.each(ANALYTICS_WINDOWS)("passes the known window %i through", (days) => {
    expect(analyticsWindow(days)).toBe(days);
  });

  it.each([0, -1, 31, 365, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "collapses %p to 30, because this value is interpolated into SQL",
    (days) => {
      expect(analyticsWindow(days)).toBe(30);
    }
  );

  it("never returns a value outside the whitelist", () => {
    for (const candidate of [7, 30, 90, 8, 1000, -5]) {
      expect(ANALYTICS_WINDOWS).toContain(analyticsWindow(candidate));
    }
  });
});

describe("rollupWindow", () => {
  it("keeps a sensible window as given", () => {
    expect(rollupWindow(3)).toBe(3);
    expect(rollupWindow(90)).toBe(90);
  });

  it("never returns less than a day, so a run always covers something", () => {
    expect(rollupWindow(0)).toBe(1);
    expect(rollupWindow(-5)).toBe(1);
  });

  it("caps a backfill at a year, because that is a migration not a cron run", () => {
    expect(rollupWindow(100000)).toBe(400);
  });

  it("truncates to a whole number, since this value is interpolated into SQL", () => {
    expect(rollupWindow(7.9)).toBe(7);
    expect(Number.isInteger(rollupWindow(7.9))).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "falls back to the default for %p",
    (value) => {
      expect(rollupWindow(value)).toBe(3);
    }
  );
});
