const query = jest.fn();
const queryOne = jest.fn();
const withTransaction = jest.fn();
jest.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => query(...args),
  queryOne: (...args: unknown[]) => queryOne(...args),
  withTransaction: (...args: unknown[]) => withTransaction(...args),
}));
jest.mock("@/lib/codes", () => ({ purgeDestination: jest.fn() }));
const checkLinks = jest.fn();
jest.mock("@/lib/reputation", () => ({
  checkLinks: (...args: unknown[]) => checkLinks(...args),
  pageLinks: jest.fn().mockReturnValue([]),
}));
const allowNewDestination = jest.fn();
jest.mock("@/lib/ratelimit", () => ({
  allowNewDestination: (...args: unknown[]) => allowNewDestination(...args),
}));
jest.mock("@/lib/entitlement", () => ({
  ...jest.requireActual("@/lib/entitlement"),
  getEntitlement: jest.fn().mockResolvedValue({
    planName: "Test",
    maxCodes: 10,
    codesUsed: 0,
    features: {},
  }),
  canCreateCode: jest.fn().mockReturnValue({ ok: true }),
}));

import {
  changeDestination,
  createCode,
  NEW_DESTINATION_REFUSAL,
} from "@/lib/user-codes";
import { scopeFor } from "@/lib/account-scope";
import { linkDestination } from "@/lib/page-content";

/** Audit M3: a ceiling on how many new places one account sends people a day. */

const scope = scopeFor("account-1", "account-1", "owner");
const LINK = "https://example.com/new";
const normalised = (() => {
  const screened = linkDestination("url", LINK);
  if (!screened.ok) throw new Error("test link should screen");
  return screened.normalised;
})();

beforeEach(() => {
  query.mockReset().mockResolvedValue([]);
  queryOne.mockReset().mockResolvedValue(null);
  withTransaction.mockReset().mockImplementation(async (work: (run: unknown) => unknown) => {
    const run = jest
      .fn()
      .mockResolvedValueOnce([]) // the slot lock
      .mockResolvedValueOnce([{ used: "0" }]) // the count under the lock
      .mockResolvedValue([{ id: "42" }]); // the insert
    return work(run);
  });
  checkLinks.mockReset().mockResolvedValue({ ok: true });
  allowNewDestination.mockReset().mockResolvedValue(true);
});

describe("changeDestination", () => {
  const current = (destination: string) => ({
    kind: "url",
    status: "active",
    archived: false,
    destination_url: destination,
  });

  it("refuses once the ceiling is spent, before Web Risk and with no write", async () => {
    queryOne.mockResolvedValueOnce(current("https://example.com/old"));
    allowNewDestination.mockResolvedValueOnce(false);

    const result = await changeDestination(scope, "7", LINK);

    expect(result).toEqual({ ok: false, reason: NEW_DESTINATION_REFUSAL });
    expect(queryOne).toHaveBeenCalledTimes(1); // the read, never the update
    expect(checkLinks).not.toHaveBeenCalled();
  });

  it("spends one unit, keyed by the account, on a new destination", async () => {
    queryOne
      .mockResolvedValueOnce(current("https://example.com/old"))
      .mockResolvedValueOnce({ short_code: "Ab3dEf9" });

    const result = await changeDestination(scope, "7", LINK);

    expect(result).toEqual({ ok: true });
    expect(allowNewDestination).toHaveBeenCalledTimes(1);
    expect(allowNewDestination).toHaveBeenCalledWith("account-1");
  });

  it("spends nothing when the destination is unchanged", async () => {
    queryOne
      .mockResolvedValueOnce(current(normalised))
      .mockResolvedValueOnce({ short_code: "Ab3dEf9" });
    allowNewDestination.mockResolvedValue(false);

    const result = await changeDestination(scope, "7", LINK);

    expect(result).toEqual({ ok: true });
    expect(allowNewDestination).not.toHaveBeenCalled();
  });

  it("spends nothing on a code it refuses for another reason", async () => {
    queryOne.mockResolvedValueOnce({ ...current("https://example.com/old"), status: "blocked" });
    await changeDestination(scope, "7", LINK);
    expect(allowNewDestination).not.toHaveBeenCalled();
  });
});

describe("createCode", () => {
  const link = { kind: "url" as const, name: "Flyer", destinationUrl: LINK };

  it("refuses a link code once the ceiling is spent, before Web Risk and with no write", async () => {
    allowNewDestination.mockResolvedValueOnce(false);

    const result = await createCode(scope, link);

    expect(result).toEqual({ ok: false, reason: NEW_DESTINATION_REFUSAL });
    expect(checkLinks).not.toHaveBeenCalled();
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it("spends one unit, keyed by the account, on a new link code", async () => {
    const result = await createCode(scope, link);

    expect(result).toEqual(expect.objectContaining({ ok: true, id: "42" }));
    expect(allowNewDestination).toHaveBeenCalledTimes(1);
    expect(allowNewDestination).toHaveBeenCalledWith("account-1");
  });

  it("spends nothing on input it refuses first", async () => {
    const result = await createCode(scope, { ...link, destinationUrl: "not a link" });
    expect(result.ok).toBe(false);
    expect(allowNewDestination).not.toHaveBeenCalled();
  });
});

describe("the refusal", () => {
  it("names no plan or price and says when to try again", () => {
    expect(NEW_DESTINATION_REFUSAL).toMatch(/tomorrow/);
    expect(NEW_DESTINATION_REFUSAL).not.toMatch(/plan|upgrade|₦|\d/i);
  });
});
