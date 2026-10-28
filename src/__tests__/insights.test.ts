import { lookupLocation, readCity } from "@/lib/geo";
import { canSeeInsights, chartDaysAllowed, type Entitlement } from "@/lib/entitlement";

function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

describe("readCity", () => {
  it("decodes Vercel's URL-encoded city", () => {
    expect(readCity(headers({ "x-vercel-ip-city": "S%C3%A3o%20Paulo" }))).toBe("São Paulo");
    expect(readCity(headers({ "x-vercel-ip-city": "Lagos" }))).toBe("Lagos");
  });

  it("yields no city, never an exception, for a malformed header", () => {
    expect(readCity(headers({ "x-vercel-ip-city": "%E0%A4%A" }))).toBeNull();
  });

  it("strips control characters and caps the length, since owners see it and export it", () => {
    expect(readCity(headers({ "x-vercel-ip-city": "Lag%0Aos" }))).toBe("Lagos");
    expect(readCity(headers({ "x-vercel-ip-city": "a".repeat(200) }))?.length).toBe(80);
  });

  it("is null when absent or empty", () => {
    expect(readCity(headers({}))).toBeNull();
    expect(readCity(headers({ "x-vercel-ip-city": "%20" }))).toBeNull();
  });
});

describe("lookupLocation", () => {
  it("records the city alongside the country", () => {
    expect(
      lookupLocation(null, headers({ "x-vercel-ip-country": "ng", "x-vercel-ip-city": "Lagos" }))
    ).toEqual({ country: "NG", city: "Lagos" });
  });

  it("records nothing without a country, as before", () => {
    expect(lookupLocation(null, headers({ "x-vercel-ip-city": "Lagos" }))).toEqual({
      country: null,
      city: null,
    });
  });
});

describe("plan gates for analytics", () => {
  const free: Entitlement = {
    planName: "Free",
    planSlug: "free",
    maxCodes: 5,
    historyDays: 30,
    codesUsed: 0,
    features: {},
    active: true,
  };

  it("keeps the detailed analytics for plans with the insights flag", () => {
    expect(canSeeInsights(free)).toBe(false);
    expect(canSeeInsights({ ...free, features: { insights: true } })).toBe(true);
    expect(canSeeInsights(null)).toBe(false);
  });

  it("allows chart windows up to the plan's scan history", () => {
    expect(chartDaysAllowed(free)).toBe(30);
    expect(chartDaysAllowed({ ...free, historyDays: 365 })).toBe(365);
    expect(chartDaysAllowed(null)).toBe(7);
  });
});
