const mockEnv: { CRON_SECRET?: string } = {};
jest.mock("@/lib/env", () => ({ env: () => mockEnv }));

import { cronAuthorized } from "@/lib/cron-auth";

function request(authorization?: string): Request {
  return new Request("https://qriateplus.com/api/cron/scans", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe("cronAuthorized (audit L13)", () => {
  afterEach(() => {
    delete mockEnv.CRON_SECRET;
  });

  it("accepts the bearer secret", () => {
    mockEnv.CRON_SECRET = "s3cret-value";
    expect(cronAuthorized(request("Bearer s3cret-value"))).toBe(true);
  });

  it.each([
    ["no header", undefined],
    ["the bare secret", "s3cret-value"],
    ["a wrong secret", "Bearer s3cret-valuf"],
    ["a longer one", "Bearer s3cret-value-and-more"],
    ["a shorter one", "Bearer s3"],
    ["non-ASCII", "Bearer s3cret-välue"],
  ])("refuses %s", (_label, header) => {
    mockEnv.CRON_SECRET = "s3cret-value";
    expect(cronAuthorized(request(header))).toBe(false);
  });

  it("refuses everything when no secret is configured, as on previews", () => {
    expect(cronAuthorized(request("Bearer "))).toBe(false);
    expect(cronAuthorized(request("Bearer undefined"))).toBe(false);
  });
});
