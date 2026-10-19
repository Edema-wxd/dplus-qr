import { clientIp, hashIp, saltDay } from "@/lib/ip";
import { resetEnvCache } from "@/lib/env";

describe("clientIp", () => {
  it("takes the first value of x-forwarded-for, which is the visitor", () => {
    const headers = new Headers({ "x-forwarded-for": "41.58.1.2, 10.0.0.1, 10.0.0.2" });
    expect(clientIp(headers)).toBe("41.58.1.2");
  });

  it("tolerates whitespace", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "  41.58.1.2  " }))).toBe("41.58.1.2");
  });

  it("falls back to other proxy headers", () => {
    expect(clientIp(new Headers({ "x-real-ip": "41.58.1.3" }))).toBe("41.58.1.3");
    expect(clientIp(new Headers({ "cf-connecting-ip": "41.58.1.4" }))).toBe("41.58.1.4");
  });

  it("returns null when no proxy header is present", () => {
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe("hashIp", () => {
  const ORIGINAL = process.env.SCAN_IP_SALT;

  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://u:p@localhost/db";
    process.env.SCAN_IP_SALT = "a-test-salt-at-least-16-chars";
    resetEnvCache();
  });

  afterAll(() => {
    process.env.SCAN_IP_SALT = ORIGINAL;
    resetEnvCache();
  });

  it("never returns the raw IP", () => {
    const hash = hashIp("41.58.1.2");
    expect(hash).not.toContain("41.58");
    expect(hash).toHaveLength(64);
  });

  it("is stable within a day, so unique counts work", () => {
    const day = new Date("2026-10-19T08:00:00Z");
    const later = new Date("2026-10-19T23:00:00Z");
    expect(hashIp("41.58.1.2", day)).toBe(hashIp("41.58.1.2", later));
  });

  it("changes across days, so a visitor cannot be followed", () => {
    const today = new Date("2026-10-19T12:00:00Z");
    const tomorrow = new Date("2026-10-20T12:00:00Z");
    expect(hashIp("41.58.1.2", today)).not.toBe(hashIp("41.58.1.2", tomorrow));
  });

  it("distinguishes two visitors on the same day", () => {
    const day = new Date("2026-10-19T12:00:00Z");
    expect(hashIp("41.58.1.2", day)).not.toBe(hashIp("41.58.1.3", day));
  });

  it("returns null for a missing IP", () => {
    expect(hashIp(null)).toBeNull();
  });

  it("returns null rather than hashing with a predictable salt", () => {
    delete process.env.SCAN_IP_SALT;
    resetEnvCache();
    expect(hashIp("41.58.1.2")).toBeNull();
  });
});

describe("saltDay", () => {
  it("uses UTC so the salt rotates at the same instant everywhere", () => {
    expect(saltDay(new Date("2026-10-19T23:59:59Z"))).toBe("2026-10-19");
    expect(saltDay(new Date("2026-10-20T00:00:01Z"))).toBe("2026-10-20");
  });
});
