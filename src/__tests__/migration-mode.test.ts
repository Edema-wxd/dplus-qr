import { migrationModeFor } from "@/lib/migration-mode";

describe("migrationModeFor", () => {
  it("applies on a Vercel production build", () => {
    expect(migrationModeFor({ VERCEL: "1", VERCEL_ENV: "production" })).toBe("apply");
  });

  it("only checks on a preview build, which shares the production database", () => {
    expect(migrationModeFor({ VERCEL: "1", VERCEL_ENV: "preview" })).toBe("check");
    expect(migrationModeFor({ VERCEL: "1", VERCEL_ENV: "development" })).toBe("check");
  });

  it("only checks when Vercel does not say which environment it is", () => {
    expect(migrationModeFor({ VERCEL: "1" })).toBe("check");
  });

  it("does nothing off Vercel, so a local build needs no database", () => {
    expect(migrationModeFor({})).toBe("skip");
    expect(migrationModeFor({ VERCEL_ENV: "production" })).toBe("skip");
  });
});
