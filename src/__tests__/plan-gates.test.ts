import { canMakeHostedPages, canUploadVideo, type Entitlement } from "@/lib/entitlement";

const plan = (features: Entitlement["features"], planName = "Free"): Entitlement => ({
  planName,
  planSlug: planName.toLowerCase(),
  maxCodes: 5,
  historyDays: 30,
  codesUsed: 0,
  features,
  active: true,
});

describe("canMakeHostedPages", () => {
  it("keeps Free to link codes, and says where pages come from", () => {
    const free = canMakeHostedPages(plan({}));
    if (free.ok) throw new Error("expected refusal");
    expect(free.reason).toMatch(/Starter and up/);
    expect(free.reason).toMatch(/link codes are included/);
  });

  it("allows a plan with the flag", () => {
    expect(canMakeHostedPages(plan({ hosted_pages: true }, "Starter"))).toEqual({ ok: true });
  });

  it("refuses an account with no plan", () => {
    expect(canMakeHostedPages(null).ok).toBe(false);
  });
});

describe("canUploadVideo", () => {
  it("is Pro and up only", () => {
    expect(canUploadVideo(plan({ hosted_pages: true }, "Starter"))).toBe(false);
    expect(canUploadVideo(plan({ hosted_pages: true, video_uploads: true }, "Pro"))).toBe(true);
    expect(canUploadVideo(null)).toBe(false);
  });
});
