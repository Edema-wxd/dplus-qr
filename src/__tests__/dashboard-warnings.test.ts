const calls: { text: string; params: unknown[] }[] = [];
jest.mock("@/lib/db", () => ({
  query: async (text: string, params: unknown[]) => {
    calls.push({ text, params });
    return [];
  },
  queryOne: async (text: string, params: unknown[]) => {
    calls.push({ text, params });
    return null;
  },
}));

import { scopeFor } from "@/lib/account-scope";
import { acknowledgeWarning, dashboardWarnings } from "@/lib/dashboard-warnings";

/**
 * Who sees a staff warning on a team account (decided 10 Nov 2026): the owner
 * and, read-only, every member; only the owner can mark one as read. The
 * database half of this was run against a real schema (DECISIONS.md,
 * 10 November); here, what each statement is asked to prove.
 */

const OWNER = "11111111-1111-1111-1111-111111111111";
const MEMBER = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  calls.length = 0;
});

describe("dashboardWarnings", () => {
  it("reads the account's warnings for the owner and any member who may read", async () => {
    await dashboardWarnings(scopeFor(OWNER, MEMBER, "viewer"));
    const [{ text, params }] = calls;
    expect(text).toContain("w.user_id = $1");
    expect(text).toContain("m.role = any($3::text[])");
    expect(params).toEqual([OWNER, MEMBER, ["admin", "editor", "viewer"]]);
  });

  it("shows only open warnings, and a read one only when it is final", async () => {
    await dashboardWarnings(scopeFor(OWNER, OWNER, "owner"));
    expect(calls[0].text).toContain("w.resolved_at is null");
    expect(calls[0].text).toContain("(w.acknowledged_at is null or w.level = 'final')");
  });
});

describe("acknowledgeWarning", () => {
  it("admits no member role, so only the owner's own scope can mark one read", async () => {
    await acknowledgeWarning(scopeFor(OWNER, MEMBER, "editor"), 7);
    const [{ text, params }] = calls;
    expect(text).toContain("$1::uuid = $3::uuid");
    expect(params).toEqual([OWNER, 7, MEMBER, []]);
  });

  it("never touches a warning staff have closed", async () => {
    await acknowledgeWarning(scopeFor(OWNER, OWNER, "owner"), 7);
    expect(calls[0].text).toContain("resolved_at is null");
  });
});
