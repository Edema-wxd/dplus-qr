const query = jest.fn();
const queryOne = jest.fn();
jest.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => query(...args),
  queryOne: (...args: unknown[]) => queryOne(...args),
  withTransaction: jest.fn(),
}));
jest.mock("@/lib/codes", () => ({ purgeDestination: jest.fn() }));
jest.mock("@/lib/reputation", () => ({
  checkLinks: jest.fn().mockResolvedValue({ ok: true }),
  pageLinks: jest.fn().mockReturnValue([]),
}));

import {
  changeDestination,
  notEditable,
  renameCode,
  scanRows,
  setCodeStyle,
  updateCodeContent,
} from "@/lib/user-codes";
import { scopeFor } from "@/lib/account-scope";

const owner = scopeFor("user-1", "user-1", "owner");

beforeEach(() => {
  query.mockReset().mockResolvedValue([]);
  queryOne.mockReset().mockResolvedValue(null);
});

/** Audit L3: staff blocks and archives hold against a forged form. */
describe("notEditable", () => {
  it("lets a live code through", () => {
    expect(notEditable({ status: "active", archived: false })).toBeNull();
    expect(notEditable({ status: "paused", archived: false })).toBeNull();
  });

  it("refuses a blocked code, saying support restores it", () => {
    expect(notEditable({ status: "blocked", archived: false })).toEqual({
      ok: false,
      reason: expect.stringContaining("support"),
    });
  });

  it("refuses an archived or missing code as not found", () => {
    expect(notEditable({ status: "active", archived: true })).toEqual({
      ok: false,
      reason: "That code could not be found.",
    });
    expect(notEditable(null)).toEqual({ ok: false, reason: "That code could not be found." });
  });
});

describe("edits to blocked or archived codes", () => {
  it("does not re-point a blocked code, and writes nothing", async () => {
    queryOne.mockResolvedValueOnce({ kind: "url", status: "blocked", archived: false });
    const result = await changeDestination(owner, "7", "https://example.com/");
    expect(result.ok).toBe(false);
    expect(queryOne).toHaveBeenCalledTimes(1);
  });

  it("does not change a blocked page's content", async () => {
    queryOne.mockResolvedValueOnce({ kind: "menu", content: {}, status: "blocked", archived: false });
    const result = await updateCodeContent(owner, "7", {});
    expect(result.ok).toBe(false);
    expect(queryOne).toHaveBeenCalledTimes(1);
  });

  it("repeats the conditions in the destination update itself", async () => {
    queryOne
      .mockResolvedValueOnce({ kind: "url", status: "active", archived: false })
      .mockResolvedValueOnce({ short_code: "Ab3dEf9" });
    await changeDestination(owner, "7", "https://example.com/");
    const sql = queryOne.mock.calls[1][0] as string;
    expect(sql).toContain("status <> 'blocked'");
    expect(sql).toContain("archived_at is null");
  });

  it.each([
    ["renameCode", () => renameCode(owner, "7", "New name")],
    ["setCodeStyle", () => setCodeStyle(owner, "7", {} as never)],
  ])("%s skips archived codes", async (_name, run) => {
    await run();
    expect(queryOne.mock.calls[0][0]).toContain("archived_at is null");
  });
});

/** Audit L2: raw scans never reach past the plan's history. */
describe("scanRows", () => {
  const interval = () => /interval '(\d+) days'/.exec(query.mock.calls[0][0] as string)?.[1];

  it("holds a 90-day request to a 7-day plan's history", async () => {
    await scanRows(owner, "7", 90, 7);
    expect(interval()).toBe("7");
  });

  it("gives a longer plan what it asked for", async () => {
    await scanRows(owner, "7", 30, 365);
    expect(interval()).toBe("30");
  });

  it("still caps raw rows at the longest daily window", async () => {
    await scanRows(owner, "7", 365, 730);
    expect(interval()).toBe("90");
  });
});
