import {
  DEFAULT_PRICING_CONTENT,
  mergePricingContent,
  POLICY_KEYS,
  pricingContentSchema,
} from "@/lib/pricing-content";
import { buildTerms, TERMS, type LegalDocument } from "@/lib/legal";

function paragraphs(doc: LegalDocument): string[] {
  return doc.sections.flatMap((s) => s.blocks.flatMap((b) => (b.kind === "p" ? [b.text] : [])));
}

describe("pricing content defaults", () => {
  it("are valid against the schema the admin saves through", () => {
    expect(pricingContentSchema.safeParse(DEFAULT_PRICING_CONTENT).success).toBe(true);
  });

  it("highlight Pro as most popular", () => {
    expect(DEFAULT_PRICING_CONTENT.featuredTier).toBe("pro");
    expect(DEFAULT_PRICING_CONTENT.featuredLabel).toBe("Most popular");
  });
});

describe("billing points and the Terms", () => {
  it("the default Terms carry every default billing point word for word", () => {
    const text = paragraphs(TERMS);
    for (const key of POLICY_KEYS) {
      expect(text).toContain(DEFAULT_PRICING_CONTENT.policy[key].detail);
    }
  });

  it("an edited billing point replaces the Terms clause, so the two pages cannot disagree", () => {
    const policy = {
      ...DEFAULT_PRICING_CONTENT.policy,
      refunds: { term: "Refunds within 7 days", detail: "Ask within 7 days of paying for a full refund." },
    };
    const text = paragraphs(buildTerms(policy));
    expect(text).toContain("Ask within 7 days of paying for a full refund.");
    expect(text).not.toContain(DEFAULT_PRICING_CONTENT.policy.refunds.detail);
  });
});

describe("mergePricingContent", () => {
  it("uses the defaults for nothing stored", () => {
    expect(mergePricingContent(null)).toEqual(DEFAULT_PRICING_CONTENT);
    expect(mergePricingContent("garbage")).toEqual(DEFAULT_PRICING_CONTENT);
  });

  it("keeps valid fields and falls back field by field on bad ones", () => {
    const merged = mergePricingContent({
      headline: "Simple pricing",
      intro: "", // empty is invalid: falls back alone
      featuredTier: "business",
      faqs: [{ question: "Can I switch plans?", answer: "Yes, at any time." }],
    });
    expect(merged.headline).toBe("Simple pricing");
    expect(merged.intro).toBe(DEFAULT_PRICING_CONTENT.intro);
    expect(merged.featuredTier).toBe("business");
    expect(merged.faqs).toHaveLength(1);
    expect(merged.policy).toEqual(DEFAULT_PRICING_CONTENT.policy);
  });

  it("refuses oversized text and too many questions", () => {
    expect(pricingContentSchema.shape.headline.safeParse("x".repeat(81)).success).toBe(false);
    const thirteen = Array.from({ length: 13 }, () => ({ question: "Q", answer: "A" }));
    expect(pricingContentSchema.shape.faqs.safeParse(thirteen).success).toBe(false);
  });

  it("refuses a featured tier that is not a slug", () => {
    expect(pricingContentSchema.shape.featuredTier.safeParse("<b>pro</b>").success).toBe(false);
  });
});
