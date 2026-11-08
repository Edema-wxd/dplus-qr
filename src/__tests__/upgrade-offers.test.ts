import type { Entitlement } from "@/lib/entitlement";
import type { Plan } from "@/lib/plans";
import { codesOffer, featureOffer, historyOffer, offerRefusal } from "@/lib/upgrade-offers";

function plan(overrides: Partial<Plan>): Plan {
  return {
    id: 1,
    slug: "starter-monthly",
    name: "Starter",
    paystackPlanCode: "PLN_s",
    amountKobo: 400_000,
    interval: "monthly",
    maxCodes: 10,
    historyDays: 90,
    graceDays: 7,
    features: {},
    isActive: true,
    sortOrder: 10,
    ...overrides,
  };
}

const PLANS: Plan[] = [
  plan({ id: 9, slug: "pro-annual", name: "Pro", interval: "annually", amountKobo: 10_000_000, maxCodes: 50, historyDays: 365, sortOrder: 21, features: { csv_export: true, insights: true } }),
  plan({ id: 1, features: { insights: true, hosted_pages: true } }),
  plan({ id: 2, slug: "starter-annual", interval: "annually", amountKobo: 4_000_000, sortOrder: 11, features: { insights: true, hosted_pages: true } }),
  plan({ id: 3, slug: "pro-monthly", name: "Pro", amountKobo: 1_000_000, maxCodes: 50, historyDays: 365, sortOrder: 20, features: { csv_export: true, insights: true, hosted_pages: true, custom_codes: true } }),
  plan({ id: 4, slug: "business-monthly", name: "Business", amountKobo: 2_500_000, maxCodes: 250, historyDays: 730, sortOrder: 30, features: { csv_export: true, custom_codes: true, share_stats: true } }),
  plan({ id: 5, slug: "retired-monthly", name: "Old", amountKobo: 100, sortOrder: 1, isActive: false, features: { share_stats: true } }),
];

const free: Entitlement = {
  planName: "Free",
  planSlug: "free",
  maxCodes: 5,
  historyDays: 30,
  codesUsed: 5,
  features: {},
  active: true, seats: 1, seatsUsed: 1,
};

describe("featureOffer", () => {
  it("names the cheapest monthly plan with the flag, and its price", () => {
    const offer = featureOffer("csv_export", free, PLANS);
    expect(offer.unlock).toEqual({ name: "Pro", price: "₦10,000 a month" });
    expect(offer.why).toBe("CSV export is not part of your Free plan.");
  });

  it("reads the flag from the rows, so moving a flag moves the answer", () => {
    expect(featureOffer("insights", free, PLANS).unlock?.name).toBe("Starter");
    expect(featureOffer("share_stats", free, PLANS).unlock?.name).toBe("Business");
  });

  it("never points at a retired plan", () => {
    const retiredOnly = PLANS.filter((p) => p.slug === "retired-monthly");
    expect(featureOffer("share_stats", free, retiredOnly).unlock).toBeNull();
  });

  it("says so when the account has no plan", () => {
    expect(featureOffer("custom_codes", null, PLANS).why).toBe(
      "Your account has no active plan, so custom links are not available."
    );
    expect(featureOffer("csv_export", null, PLANS).why).toMatch(/so CSV export is not/);
    expect(featureOffer("hosted_pages", free, PLANS).why).toBe("Hosted pages are not part of your Free plan.");
  });
});

describe("historyOffer", () => {
  it("finds the first plan that keeps the window", () => {
    const offer = historyOffer(90, free, PLANS);
    expect(offer.unlock?.name).toBe("Starter");
    expect(offer.why).toBe("Your Free plan keeps 30 days of scan history.");
    expect(historyOffer(365, free, PLANS).unlock?.name).toBe("Pro");
  });

  it("names a long window in months, as the pricing table does", () => {
    expect(historyOffer(90, free, PLANS).title).toBe("90 days of scans");
    expect(historyOffer(180, free, PLANS).title).toBe("6 months of scans");
    expect(historyOffer(365, free, PLANS).title).toBe("12 months of scans");
    expect(historyOffer(730, free, PLANS).benefit).toMatch(/^Look back over the last 24 months of scans/);
  });
});

describe("codesOffer", () => {
  it("offers the first plan with more codes than this one", () => {
    expect(codesOffer(free, PLANS).unlock?.name).toBe("Starter");
    expect(codesOffer({ ...free, planName: "Pro", maxCodes: 50 }, PLANS).unlock?.name).toBe("Business");
    expect(codesOffer(free, PLANS).why).toMatch(/all 5 dynamic codes on your Free plan/);
  });

  it("offers nothing above the largest plan", () => {
    expect(codesOffer({ ...free, maxCodes: 250 }, PLANS).unlock).toBeNull();
  });
});

describe("offerRefusal", () => {
  it("names the plan the rows say unlocks it, then what to do instead", () => {
    const offer = featureOffer("video_uploads", null, [
      plan({ id: 7, name: "Studio", features: { video_uploads: true } }),
    ]);
    const sentence = offerRefusal(offer, "Link a YouTube or Vimeo video instead.");
    expect(sentence).toContain("They come with Studio.");
    expect(sentence).toMatch(/Link a YouTube or Vimeo video instead\.$/);
    expect(sentence).not.toMatch(/Pro|Business/);
  });

  it("names no plan when none on sale has the feature", () => {
    const sentence = offerRefusal(featureOffer("video_uploads", null, PLANS));
    expect(sentence).not.toMatch(/come with/);
  });
});
