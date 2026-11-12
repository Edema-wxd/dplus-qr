const query = jest.fn();
const queryOne = jest.fn();
jest.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => query(...args),
  queryOne: (...args: unknown[]) => queryOne(...args),
}));
const purgeDestination = jest.fn();
jest.mock("@/lib/codes", () => ({
  purgeDestination: (...args: unknown[]) => purgeDestination(...args),
}));

import { readFileSync } from "node:fs";
import path from "node:path";
import { ensureProfile } from "@/lib/profile";

/**
 * Security audit M3: a new account's codes are held until its email is
 * confirmed (migration 033). `ensureProfile` is where the hold is set and
 * released; these pin who it may touch.
 */

const user = { id: "u1", email: "a@example.com", name: "A" };

function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "a@example.com",
    name: "A",
    paystack_customer_code: null,
    suspended_at: null,
    codes_held_since: null,
    released: false,
    ...overrides,
  };
}

/** The upsert's SQL and parameters. */
function upsert(): { sql: string; params: unknown[] } {
  const call = query.mock.calls.find(([sql]) => String(sql).includes("insert into qr_users"));
  if (!call) throw new Error("no profile upsert");
  return { sql: String(call[0]), params: call[1] as unknown[] };
}

beforeEach(() => {
  query.mockReset();
  queryOne.mockReset();
  purgeDestination.mockReset();
});

describe("ensureProfile and the email hold", () => {
  it("creates an unverified account held, and tells the database it is unverified", async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes("insert into qr_users") ? [profileRow({ codes_held_since: new Date() })] : []
    );
    const profile = await ensureProfile({ ...user, emailVerified: false });
    expect(upsert().params[3]).toBe(false);
    expect(profile.codesHeldSince).toBeInstanceOf(Date);
    expect(purgeDestination).not.toHaveBeenCalled();
  });

  it.each([undefined, null])("treats an unknown verification (%p) as unverified", async (emailVerified) => {
    query.mockImplementation(async (sql: string) => (sql.includes("insert into qr_users") ? [profileRow()] : []));
    await ensureProfile({ ...user, emailVerified });
    expect(upsert().params[3]).toBe(false);
  });

  it("purges the account's codes from the redirect cache when the hold is released", async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("insert into qr_users")) return [profileRow({ released: true })];
      if (sql.includes("select short_code from qr_codes")) return [{ short_code: "Ab3kQ9x" }, { short_code: "Zz9pQ2w" }];
      return [];
    });
    const profile = await ensureProfile({ ...user, emailVerified: true });
    expect(upsert().params[3]).toBe(true);
    expect(profile.codesHeldSince).toBeNull();
    expect(purgeDestination.mock.calls.map(([code]) => code).sort()).toEqual(["Ab3kQ9x", "Zz9pQ2w"]);
  });

  it("purges nothing on an ordinary page load", async () => {
    query.mockImplementation(async (sql: string) => (sql.includes("insert into qr_users") ? [profileRow()] : []));
    await ensureProfile({ ...user, emailVerified: true });
    expect(purgeDestination).not.toHaveBeenCalled();
  });

  it("still returns the profile when the purge fails", async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("insert into qr_users")) return [profileRow({ released: true })];
      if (sql.includes("select short_code from qr_codes")) throw new Error("database gone");
      return [];
    });
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(ensureProfile({ ...user, emailVerified: true })).resolves.toMatchObject({ id: "u1" });
    spy.mockRestore();
  });

  /**
   * The statement itself. A hold on an existing row would take a live printed
   * code down: every account from before the hold, and any verified account
   * that changes to an address it has not confirmed yet.
   */
  it("holds only on insert, and on conflict can only keep or clear the hold", async () => {
    query.mockImplementation(async (sql: string) => (sql.includes("insert into qr_users") ? [profileRow()] : []));
    await ensureProfile({ ...user, emailVerified: false });
    const { sql } = upsert();
    const [insert, update] = sql.split(/on conflict/i);
    expect(insert).toMatch(/case when \$4 then null else now\(\) end/);
    expect(update).toMatch(/codes_held_since = case when \$4 then null else qr_users\.codes_held_since end/);
    expect(update).not.toMatch(/now\(\)\s*end/);
  });
});

describe("every caller passes the session's verification", () => {
  const root = path.join(__dirname, "..");
  const callers = [
    "app/(app)/app/page.tsx",
    "app/(app)/app/start/page.tsx",
    "app/(app)/app/team/page.tsx",
    "app/(app)/app/new/page.tsx",
    "app/(app)/app/new/bulk/page.tsx",
    "app/(app)/app/files/page.tsx",
    "app/(app)/auth/sign-up/actions.ts",
    "app/(app)/auth/invite/[token]/actions.ts",
    "app/(app)/account/page.tsx",
    "app/(app)/billing/page.tsx",
  ];

  it.each(callers)("%s", (file) => {
    const source = readFileSync(path.join(root, file), "utf8");
    const calls = source.match(/ensureProfile\(\{[\s\S]*?\}\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).toMatch(/emailVerified: (data\.)?user\.emailVerified/);
  });
});
