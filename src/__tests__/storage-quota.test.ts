import { DEFAULT_STORAGE_MB, storageQuotaBytes, storageRefusal } from "@/lib/storage-quota";
import { PLAN_FEATURES, advertisedFeatures } from "@/lib/plan-features";
import { PAGE_KINDS } from "@/lib/files";
import { LINK_KINDS } from "@/lib/qr-types";

jest.mock("@/lib/db", () => ({ query: jest.fn(), queryOne: jest.fn(), withTransaction: jest.fn() }));

const MB = 1024 * 1024;

describe("storageQuotaBytes", () => {
  it("reads the plan's storage_mb", () => {
    expect(storageQuotaBytes({ storage_mb: 250 })).toBe(250 * MB);
  });

  it.each([undefined, null, {}, { storage_mb: "lots" }, { storage_mb: -5 }, { storage_mb: Number.NaN }])(
    "falls back to the default for %p, never to no limit",
    (features) => {
      expect(storageQuotaBytes(features as never)).toBe(DEFAULT_STORAGE_MB * MB);
    }
  );
});

describe("storageRefusal", () => {
  it("lets an upload that fits exactly through", () => {
    expect(storageRefusal(240 * MB, 10 * MB, 250 * MB)).toBeNull();
  });

  it("says how much is left and how big the upload is", () => {
    expect(storageRefusal(240 * MB, 16 * MB, 250 * MB)).toBe(
      "Your account has 10 MB of its 250 MB for page files left, and this upload is 16 MB. Choose a smaller file, or see Billing for plans with more room."
    );
  });

  it("says plainly when nothing is left, including an account already over after a downgrade", () => {
    expect(storageRefusal(300 * MB, MB, 250 * MB)).toMatch(/^Your account has used all 250 MB of storage/);
  });

  it("names no plan and no price", () => {
    const text = storageRefusal(300 * MB, MB, 250 * MB)!;
    expect(text).not.toMatch(/Free|Starter|Pro|Business|₦/);
  });
});

describe("the catalogue entry", () => {
  const def = PLAN_FEATURES.find((d) => d.key === "storage_mb");

  it("is editable from /admin/plans as a number", () => {
    expect(def).toMatchObject({ kind: "number", built: true });
  });

  it("is not advertised on the price table, which says nothing about storage yet", () => {
    expect(advertisedFeatures({ storage_mb: 250 })).toEqual(advertisedFeatures({}));
  });
});

describe("PAGE_KINDS", () => {
  it("is every dynamic kind except plain links", () => {
    for (const kind of LINK_KINDS) expect(PAGE_KINDS).not.toContain(kind);
    expect(PAGE_KINDS.length).toBeGreaterThan(0);
  });
});
