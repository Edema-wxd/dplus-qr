import { planRefusal } from "@/lib/checkout";
import type { Plan } from "@/lib/plans";

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 3,
    slug: "pro-monthly",
    name: "Pro",
    paystackPlanCode: "PLN_pro",
    amountKobo: 1_000_000,
    interval: "monthly",
    maxCodes: 50,
    historyDays: 365,
    graceDays: 7,
    features: { csv_export: true },
    isActive: true,
    sortOrder: 20,
    ...overrides,
  };
}

describe("planRefusal", () => {
  it("allows a plan with room to spare", () => {
    expect(planRefusal(plan(), 3)).toBeNull();
  });

  it("allows a plan the customer exactly fills", () => {
    // 50 codes on a 50-code plan is within the plan, not over it. An
    // off-by-one here would refuse a legitimate renewal.
    expect(planRefusal(plan(), 50)).toBeNull();
  });

  /**
   * The guard that matters. INFRASTRUCTURE's eventual design lets the customer
   * pick which codes stay when they drop a tier; until that exists, taking the
   * money and choosing for them which printed codes go dark is the one
   * outcome that is actually unacceptable.
   */
  it("refuses a downgrade below the codes already held", () => {
    const refusal = planRefusal(plan({ maxCodes: 10, name: "Starter" }), 24);
    expect(refusal?.ok).toBe(false);
    expect(refusal?.reason).toContain("24");
    expect(refusal?.reason).toContain("10");
  });

  it("refuses a retired plan", () => {
    expect(planRefusal(plan({ isActive: false }), 1)?.ok).toBe(false);
  });

  /**
   * A plan with no Paystack code cannot be charged, so offering it would send
   * someone to a checkout that fails. This is the state every paid plan is in
   * until `npm run plans:sync` runs.
   */
  it("refuses a plan with no Paystack code", () => {
    expect(planRefusal(plan({ paystackPlanCode: null }), 1)?.ok).toBe(false);
  });

  it("refuses a free plan as a purchase", () => {
    expect(
      planRefusal(plan({ amountKobo: 0, slug: "free", paystackPlanCode: null }), 1)?.ok
    ).toBe(false);
  });
});
