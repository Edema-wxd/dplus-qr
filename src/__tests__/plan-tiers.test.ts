import { featureLines, groupTiers, historyLabel, naira, tierKey } from "@/lib/plan-tiers";
import type { Plan } from "@/lib/plans";

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 1,
    slug: "starter-monthly",
    name: "Starter",
    paystackPlanCode: "PLN_starter",
    amountKobo: 400_000,
    interval: "monthly",
    maxCodes: 10,
    historyDays: 90,
    graceDays: 7,
    features: { csv_export: false, support: "email" },
    isActive: true,
    sortOrder: 10,
    ...overrides,
  };
}

/** The six rows migration 013 seeds, in sort order. */
const SEEDED: Plan[] = [
  plan(),
  plan({ id: 2, slug: "starter-annual", interval: "annually", amountKobo: 4_000_000, features: { support: "email", months_free: 2 } }),
  plan({ id: 3, slug: "pro-monthly", name: "Pro", amountKobo: 1_000_000, maxCodes: 50, historyDays: 365, features: { csv_export: true, custom_codes: true, support: "whatsapp_priority" } }),
  plan({ id: 4, slug: "pro-annual", name: "Pro", interval: "annually", amountKobo: 10_000_000, maxCodes: 50, historyDays: 365, features: { csv_export: true, custom_codes: true, months_free: 2 } }),
  plan({ id: 5, slug: "business-monthly", name: "Business", amountKobo: 2_500_000, maxCodes: 250, historyDays: 730, features: { csv_export: true, custom_codes: true, team_seats: true, bulk_creation: true } }),
  plan({ id: 6, slug: "business-annual", name: "Business", interval: "annually", amountKobo: 25_000_000, maxCodes: 250, historyDays: 730, paystackPlanCode: null }),
];

describe("naira", () => {
  it("formats kobo as whole naira", () => {
    expect(naira(400_000)).toBe("4,000");
    expect(naira(25_000_000)).toBe("250,000");
  });
});

describe("historyLabel", () => {
  it("speaks in the units the pricing table was agreed in", () => {
    expect(historyLabel(90)).toBe("90 days");
    expect(historyLabel(365)).toBe("12 months");
    expect(historyLabel(730)).toBe("24 months");
  });
});

describe("tierKey", () => {
  it("strips the interval suffix", () => {
    expect(tierKey("pro-monthly")).toBe("pro");
    expect(tierKey("pro-annual")).toBe("pro");
    expect(tierKey("seed-test")).toBe("seed-test");
  });
});

describe("groupTiers", () => {
  const tiers = groupTiers(SEEDED);

  it("folds six rows into three tiers, in order", () => {
    expect(tiers.map((t) => t.name)).toEqual(["Starter", "Pro", "Business"]);
  });

  it("pairs each tier's monthly and annual prices", () => {
    const starter = tiers[0];
    expect(starter.monthly?.priceNgn).toBe("4,000");
    expect(starter.annual?.priceNgn).toBe("40,000");
    expect(starter.annual?.perMonthNgn).toBe("3,333");
    expect(starter.annual?.monthsFree).toBe(2);
  });

  it("marks a row with no Paystack code as not purchasable", () => {
    const business = tiers[2];
    expect(business.monthly?.purchasable).toBe(true);
    expect(business.annual?.purchasable).toBe(false);
  });

  it("describes the tier from its monthly row even when the annual row comes first", () => {
    const [tier] = groupTiers([
      plan({ slug: "pro-annual", name: "Pro (annual)", interval: "annually", maxCodes: 1 }),
      plan({ slug: "pro-monthly", name: "Pro", maxCodes: 50 }),
    ]);
    expect(tier.name).toBe("Pro");
    expect(tier.maxCodes).toBe(50);
    expect(tier.annual?.slug).toBe("pro-annual");
  });
});

describe("featureLines", () => {
  it("never advertises flags nothing implements", () => {
    const lines = featureLines(SEEDED[4]).join(" ").toLowerCase();
    expect(lines).not.toMatch(/team|seat|bulk/);
  });

  it("lists what the product enforces", () => {
    expect(featureLines(SEEDED[0])).toContain("No CSV export");
    expect(featureLines(SEEDED[2])).toEqual(
      expect.arrayContaining(["CSV export of scans", "Custom links, like /yourname", "Priority WhatsApp support"])
    );
  });
});
