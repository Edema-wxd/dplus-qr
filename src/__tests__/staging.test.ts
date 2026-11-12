const mockPlan = { id: 7, slug: "business-monthly", name: "Business", amountKobo: 1_500_000, paystackPlanCode: "PLN_x" };
const mockEnv: Record<string, string | undefined> = {};
jest.mock("@/lib/env", () => ({ env: () => mockEnv, required: (k: string) => mockEnv[k] }));
jest.mock("@/lib/plans", () => ({ getPlanBySlug: async () => mockPlan }));
const mockQuery = jest.fn();
jest.mock("@/lib/db", () => ({ query: (...a: unknown[]) => mockQuery(...a), queryOne: (...a: unknown[]) => mockQuery(...a) }));

import { renderToStaticMarkup } from "react-dom/server";
import { databaseEndpoint, isStagingDeploy, sameDatabase, STAGING_HOST } from "@/lib/staging";
import { StagingBanner } from "@/components/StagingBanner";
import robots from "@/app/robots";
import nextConfig from "../../next.config";
import { startCheckout } from "@/lib/checkout";

const realEnv = process.env.VERCEL_ENV;
afterEach(() => {
  if (realEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = realEnv;
  delete mockEnv.PAYSTACK_SECRET_KEY;
  mockQuery.mockReset();
});

describe("telling databases apart", () => {
  const direct = "postgresql://owner:pw@ep-cool-rain-123.eu-central-1.aws.neon.tech/neondb?sslmode=require";
  const pooled = "postgresql://owner:pw@ep-cool-rain-123-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
  const other = "postgresql://owner:pw@ep-quiet-sun-456.eu-central-1.aws.neon.tech/neondb?sslmode=require";

  it("treats the pooled and direct URLs of one Neon branch as the same database", () => {
    expect(databaseEndpoint(pooled)).toBe("ep-cool-rain-123");
    expect(sameDatabase(direct, pooled)).toBe(true);
    expect(sameDatabase(direct, other)).toBe(false);
  });

  it("tells two databases on one ordinary server apart by port and name", () => {
    expect(sameDatabase("postgres://u@127.0.0.1:5499/prod", "postgres://u@127.0.0.1:5499/staging")).toBe(false);
    expect(sameDatabase("postgres://u@127.0.0.1/prod", "postgres://v@127.0.0.1:5432/prod")).toBe(true);
  });

  it("never calls a missing or unreadable URL the same as anything", () => {
    expect(sameDatabase(undefined, direct)).toBe(false);
    expect(sameDatabase("not a url", "not a url")).toBe(false);
  });
});

describe("staging is every preview, and only previews", () => {
  it("reads Vercel's environment", () => {
    expect(isStagingDeploy({ VERCEL_ENV: "preview" })).toBe(true);
    expect(isStagingDeploy({ VERCEL_ENV: "production" })).toBe(false);
    expect(isStagingDeploy({})).toBe(false);
  });

  it("shows the banner on staging and nothing in production", () => {
    process.env.VERCEL_ENV = "production";
    expect(renderToStaticMarkup(StagingBanner())).toBe("");
    process.env.VERCEL_ENV = "preview";
    const html = renderToStaticMarkup(StagingBanner()!);
    expect(html).toContain("Staging, with test data only");
    expect(html).toContain(`${STAGING_HOST}/&lt;code&gt;`);
  });

  it("keeps every crawler out of staging, and leaves production's robots.txt as it was", () => {
    process.env.VERCEL_ENV = "preview";
    expect(robots()).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
    process.env.VERCEL_ENV = "production";
    expect(robots().sitemap).toBe("https://qriateplus.com/sitemap.xml");
  });

  it("sends noindex on every staging response, including on its custom domain", async () => {
    const tag = async () =>
      (await nextConfig.headers!())[0].headers.find((h) => h.key === "X-Robots-Tag")?.value;
    process.env.VERCEL_ENV = "preview";
    expect(await tag()).toBe("noindex, nofollow");
    process.env.VERCEL_ENV = "production";
    expect(await tag()).toBeUndefined();
  });
});

describe("checkout on staging", () => {
  it("says payments are off, before recording anything or calling Paystack", async () => {
    process.env.VERCEL_ENV = "preview";
    const result = await startCheckout({ userId: "u1", planSlug: "business-monthly" });
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/^Payments are switched off on staging/) });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("goes ahead on staging once a test key is set", async () => {
    process.env.VERCEL_ENV = "preview";
    mockEnv.PAYSTACK_SECRET_KEY = "sk_test_x";
    mockQuery.mockResolvedValueOnce(null); // no such account: stops before Paystack
    expect(await startCheckout({ userId: "u1", planSlug: "business-monthly" })).toEqual({
      ok: false,
      reason: "We could not find your account.",
    });
  });
});
