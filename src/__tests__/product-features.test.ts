import { PLAN_FEATURES, productFeatures } from "@/lib/plan-features";
import { llmsTxt } from "@/lib/llms-txt";

describe("productFeatures", () => {
  const lines = productFeatures();

  it("names team seats without a plan's number", () => {
    expect(lines).toContain("Team accounts, each person with their own sign-in");
    expect(lines.some((l) => /Up to \d+ people/.test(l))).toBe(false);
  });

  it("lists every built yes/no flag and nothing unbuilt", () => {
    for (const def of PLAN_FEATURES) {
      if (def.kind !== "boolean") continue;
      expect(lines.includes(def.label)).toBe(def.built);
    }
  });

  it("leaves out plan-level values: support level and months free", () => {
    expect(lines.some((l) => /support|months free/i.test(l))).toBe(false);
  });

  it("is what llms.txt lists", () => {
    const text = llmsTxt(null);
    for (const line of lines) expect(text).toContain(`- ${line} (on some plans`);
  });
});
