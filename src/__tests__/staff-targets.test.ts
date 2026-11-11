/**
 * Audit L9: staff cannot suspend, block, archive or warn another staff
 * account, and cannot assign a plan to an erased account.
 */
const isAdmin = jest.fn();
jest.mock("@/lib/admin", () => ({
  isAdmin: (...args: unknown[]) => isAdmin(...args),
  STAFF_TARGET: "staff target",
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("uploadthing/server", () => ({ UTApi: jest.fn() }));
jest.mock("@/lib/auth/server", () => ({ auth: {} }));
jest.mock("@/lib/uploads", () => ({ uploadsEnabled: jest.fn() }));
jest.mock("@/lib/moderation");
jest.mock("@/lib/reports");
jest.mock("@/lib/upload-cleanup");
jest.mock("@/lib/team");
jest.mock("@/lib/email", () => ({ sendEmail: jest.fn() }));
jest.mock("@/lib/warnings");
jest.mock("@/app/(admin)/admin/guard", () => ({
  staffForAction: jest.fn().mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" }),
  recordChange: jest.fn(),
}));

const run = jest.fn();
jest.mock("@/lib/db", () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  withTransaction: async <T,>(fn: (r: typeof run) => Promise<T>) => fn(run),
}));
jest.mock("@/lib/codes", () => ({ purgeDestination: jest.fn() }));

import { accountAction } from "@/app/(admin)/admin/moderation-actions";
import { issueWarningAction } from "@/app/(admin)/admin/warning-actions";
import { suspendAccount } from "@/lib/moderation";
import { issueWarning } from "@/lib/warnings";
import { assignPlan } from "@/lib/plan-admin";

const target = "22222222-2222-4222-8222-222222222222";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  isAdmin.mockReset();
  run.mockReset();
  jest.mocked(suspendAccount).mockReset().mockResolvedValue(true);
});

describe("account actions on a staff account", () => {
  it.each(["suspend", "block_all", "archive"])("refuses %s", async (op) => {
    isAdmin.mockResolvedValue(true);
    const result = await accountAction({}, form({ userId: target, op, reason: "Phishing links" }));
    expect(result).toEqual({ error: "staff target" });
    expect(suspendAccount).not.toHaveBeenCalled();
  });

  it("still suspends a customer", async () => {
    isAdmin.mockResolvedValue(false);
    const result = await accountAction({}, form({ userId: target, op: "suspend" }));
    expect(result.notice).toBeDefined();
    expect(suspendAccount).toHaveBeenCalledWith(target);
  });

  it("refuses a warning to a staff account", async () => {
    isAdmin.mockResolvedValue(true);
    const result = await issueWarningAction({}, form({ userId: target, level: "notice", message: "x".repeat(40) }));
    expect(result).toEqual({ error: "staff target" });
    expect(issueWarning).not.toHaveBeenCalled();
  });
});

describe("assignPlan", () => {
  const plan = { slug: "pro", name: "Pro", maxCodes: 100, isActive: true, features: {} } as never;

  it("refuses an erased account before touching its subscriptions", async () => {
    run.mockResolvedValueOnce([{ erased: true }]);
    expect(await assignPlan(target, plan)).toEqual({ ok: false, error: "That account has been erased." });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("refuses an account that does not exist", async () => {
    run.mockResolvedValueOnce([]);
    expect(await assignPlan(target, plan)).toEqual({ ok: false, error: "That account does not exist." });
  });
});
