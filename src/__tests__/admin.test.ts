import { isAdminRole } from "@/lib/admin";
import { likeContains, monthlyKobo, summariseRevenue, type PlanSubscribers } from "@/lib/admin-billing";
import { assignRefusal, featuresFromForm, newPlanSchema, planFieldsSchema } from "@/lib/plan-admin";
import { advertisedFeatures } from "@/lib/plan-features";
import { paystackPlanMatches, paystackPlanTitle } from "@/lib/paystack";

describe("isAdminRole", () => {
  it("reads Better Auth's comma-separated roles", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("user, admin")).toBe(true);
    expect(isAdminRole("ADMIN")).toBe(true);
  });

  it("refuses anything else", () => {
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole("")).toBe(false);
    expect(isAdminRole("user")).toBe(false);
    expect(isAdminRole("administrator")).toBe(false);
  });
});

describe("likeContains", () => {
  it("escapes wildcards so a search matches literally", () => {
    expect(likeContains("100%")).toBe("%100\\%%");
    expect(likeContains("a_b")).toBe("%a\\_b%");
    expect(likeContains("back\\slash")).toBe("%back\\\\slash%");
  });
});

describe("revenue", () => {
  const row = (overrides: Partial<PlanSubscribers>): PlanSubscribers => ({
    planId: 1,
    slug: "starter-monthly",
    name: "Starter",
    interval: "monthly",
    amountKobo: 400_000,
    isActive: true,
    hasPaystackCode: true,
    active: 0,
    pastDue: 0,
    nonRenewing: 0,
    ...overrides,
  });

  it("spreads an annual price over twelve months", () => {
    expect(monthlyKobo(4_000_000, "annually")).toBe(333_333);
    expect(monthlyKobo(400_000, "monthly")).toBe(400_000);
  });

  it("counts only active paid plans as recurring, and overdue as at risk", () => {
    const summary = summariseRevenue([
      row({ slug: "free", amountKobo: 0, active: 9 }),
      row({ active: 2, pastDue: 1, nonRenewing: 1 }),
      row({ slug: "pro-annual", interval: "annually", amountKobo: 12_000_000, active: 1 }),
    ]);
    expect(summary.mrrKobo).toBe(2 * 400_000 + 1_000_000);
    expect(summary.atRiskKobo).toBe(400_000);
    expect(summary.paidActive).toBe(3);
    expect(summary.pastDue).toBe(1);
    expect(summary.nonRenewing).toBe(1);
    expect(summary.free).toBe(9);
  });
});

describe("assignRefusal", () => {
  const plan = { slug: "pro-monthly", name: "Pro", maxCodes: 50, isActive: true };
  const base = { liveViaPaystack: false, currentSlug: "free" };

  it("allows an assignment that fits", () => {
    expect(assignRefusal({ ...base, plan, codesHeld: 50 })).toBeNull();
  });

  it("never overrides a Paystack subscription", () => {
    expect(assignRefusal({ ...base, plan, codesHeld: 0, liveViaPaystack: true })).toMatch(/Paystack/);
  });

  it("refuses a retired plan and a plan smaller than the codes held", () => {
    expect(assignRefusal({ ...base, plan: { ...plan, isActive: false }, codesHeld: 0 })).toMatch(/retired/);
    expect(assignRefusal({ ...base, plan, codesHeld: 51 })).toMatch(/51 codes/);
  });

  it("refuses the plan the account is already on", () => {
    expect(assignRefusal({ ...base, plan, codesHeld: 0, currentSlug: "pro-monthly" })).toMatch(/already on Pro/);
  });
});

describe("featuresFromForm", () => {
  function form(entries: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(entries)) data.set(key, value);
    return data;
  }

  it("reads the catalogue's fields and drops what is unset", () => {
    const features = featuresFromForm(
      form({ "feature:csv_export": "on", "feature:support": "priority", "feature:months_free": "2" }),
      { custom_codes: true }
    );
    expect(features).toEqual({ csv_export: true, support: "priority", months_free: 2 });
  });

  it("keeps keys the catalogue does not know", () => {
    expect(featuresFromForm(form({}), { legacy_flag: "x" })).toEqual({ legacy_flag: "x" });
  });

  it("ignores values outside the catalogue", () => {
    const features = featuresFromForm(form({ "feature:support": "phone", "feature:months_free": "40" }));
    expect(features).toEqual({});
  });
});

describe("plan schemas", () => {
  const fields = { name: "Pro", maxCodes: "50", historyDays: "365", graceDays: "7", sortOrder: "20", isActive: "on" };

  it("coerces form strings", () => {
    expect(planFieldsSchema.parse(fields)).toEqual({
      name: "Pro",
      maxCodes: 50,
      historyDays: 365,
      graceDays: 7,
      sortOrder: 20,
      isActive: true,
    });
    expect(planFieldsSchema.parse({ ...fields, isActive: null }).isActive).toBe(false);
  });

  it("stores naira as kobo and rejects fractions", () => {
    const parsed = newPlanSchema.parse({ ...fields, slug: "Pro-Monthly", amountKobo: "10000", interval: "monthly" });
    expect(parsed.amountKobo).toBe(1_000_000);
    expect(parsed.slug).toBe("pro-monthly");
    expect(newPlanSchema.safeParse({ ...fields, slug: "pro", amountKobo: "99.5", interval: "monthly" }).success).toBe(false);
  });

  it("rejects a slug that is not one", () => {
    expect(newPlanSchema.safeParse({ ...fields, slug: "pro monthly", amountKobo: "1", interval: "monthly" }).success).toBe(false);
    expect(newPlanSchema.safeParse({ ...fields, slug: "-pro", amountKobo: "1", interval: "monthly" }).success).toBe(false);
  });

  it("keeps grace within the database's own check", () => {
    expect(planFieldsSchema.safeParse({ ...fields, graceDays: "91" }).success).toBe(false);
  });
});

describe("advertisedFeatures", () => {
  it("advertises built flags only", () => {
    expect(advertisedFeatures({ csv_export: true, team_seats: true, analytics: "trends", support: "email" })).toEqual([
      "CSV export of scans",
      "Email support",
    ]);
  });
});

describe("Paystack plan matching", () => {
  it("names a plan the way receipts show it", () => {
    expect(paystackPlanTitle({ name: "Pro", interval: "annually" })).toBe("QRiate+ Pro Annual");
  });

  it("matches on name, amount and interval together", () => {
    const remote = { id: 1, name: "QRiate+ Pro Monthly", plan_code: "PLN_x", amount: 1_000_000, interval: "monthly" };
    expect(paystackPlanMatches(remote, { name: "Pro", amountKobo: 1_000_000, interval: "monthly" })).toBe(true);
    expect(paystackPlanMatches(remote, { name: "Pro", amountKobo: 1_000_000, interval: "annually" })).toBe(false);
    expect(paystackPlanMatches(remote, { name: "Pro", amountKobo: 900_000, interval: "monthly" })).toBe(false);
  });
});
