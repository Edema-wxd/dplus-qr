import type { Entitlement } from "@/lib/entitlement";
import type { Plan } from "@/lib/plans";
import { featureOffer, offerRefusal } from "@/lib/upgrade-offers";

const listPublicPlans = jest.fn<Promise<Plan[]>, []>();
jest.mock("@/lib/plans", () => ({ listPublicPlans: () => listPublicPlans() }));

import { featureRefusal } from "@/lib/refusals";

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

const free: Entitlement = {
  planName: "Free",
  planSlug: "free",
  maxCodes: 3,
  historyDays: 30,
  codesUsed: 0,
  features: {},
  active: true,
};

// Names no real plan has, so a sentence that still carries a written-in
// "Starter", "Pro" or "Business" cannot pass by coincidence.
const PLANS: Plan[] = [
  plan({ id: 1, name: "Studio", sortOrder: 10, features: { hosted_pages: true } }),
  plan({ id: 2, slug: "agency", name: "Agency", amountKobo: 2_000_000, sortOrder: 20, features: { hosted_pages: true, custom_codes: true, share_stats: true } }),
  plan({ id: 3, slug: "studio-annual", name: "Studio", interval: "annually", sortOrder: 11, features: { hosted_pages: true, custom_codes: true } }),
];

const WRITTEN_IN = /Starter|Pro\b|Business|₦/;

describe("offerRefusal for the plan gates", () => {
  it("names the cheapest monthly plan with custom links, from the rows", () => {
    const sentence = offerRefusal(featureOffer("custom_codes", free, PLANS));
    expect(sentence).toBe("Custom links are not part of your Free plan. They come with Agency.");
  });

  it("names the plan with hosted pages, then what stays open", () => {
    const sentence = offerRefusal(featureOffer("hosted_pages", free, PLANS), "Link codes are included.");
    expect(sentence).toBe(
      "Hosted pages are not part of your Free plan. They come with Studio. Link codes are included."
    );
  });

  it("names the plan with share links", () => {
    const sentence = offerRefusal(featureOffer("share_stats", free, PLANS));
    expect(sentence).toBe("Share stats links are not part of your Free plan. They come with Agency.");
  });

  it("follows a flag that staff moved to another plan", () => {
    const moved = PLANS.map((row) =>
      row.id === 1 ? { ...row, features: { ...row.features, share_stats: true } } : row
    );
    expect(offerRefusal(featureOffer("share_stats", free, moved))).toMatch(/They come with Studio\.$/);
  });

  it("names no plan when none on sale has the feature", () => {
    const sentence = offerRefusal(featureOffer("share_stats", free, [PLANS[0]]));
    expect(sentence).toBe("Share stats links are not part of your Free plan.");
  });

  it("explains an account with no plan", () => {
    const sentence = offerRefusal(featureOffer("custom_codes", null, PLANS));
    expect(sentence).toBe(
      "Your account has no active plan, so custom links are not available. They come with Agency."
    );
  });

  it.each(["custom_codes", "hosted_pages", "share_stats"] as const)(
    "never writes a plan name or price into the %s refusal",
    (gate) => {
      expect(offerRefusal(featureOffer(gate, free, PLANS))).not.toMatch(WRITTEN_IN);
    }
  );
});

describe("featureRefusal", () => {
  it("reads the public plans and builds the sentence from them", async () => {
    listPublicPlans.mockResolvedValueOnce(PLANS);
    await expect(featureRefusal("hosted_pages", free, "Link codes are included.")).resolves.toBe(
      "Hosted pages are not part of your Free plan. They come with Studio. Link codes are included."
    );
    expect(listPublicPlans).toHaveBeenCalledTimes(1);
  });
});
