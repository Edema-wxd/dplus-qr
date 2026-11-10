/**
 * The retry in `createBulk`, against a fake transaction: a generated code
 * the unique index refuses is retried with a fresh one, and a refused custom
 * link rolls the batch back. Both depend on what `on conflict do nothing`
 * returns, which is all this fake reproduces. The real queries, the lock
 * and the limit are exercised against Postgres (see DECISIONS, 7 Nov 2026).
 */
const codes = ["AAAAAAA", "AAAAAAA", "BBBBBBB", "CCCCCCC", "DDDDDDD", "EEEEEEE"];
let next = 0;
jest.mock("@/lib/short-code", () => ({
  ...jest.requireActual("@/lib/short-code"),
  generateCode: () => codes[next++],
}));

const existing = new Set<string>();
const statements: string[] = [];
let rolledBack = false;
jest.mock("@/lib/db", () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  withTransaction: async (work: (run: unknown) => Promise<unknown>) => {
    const pending = new Set<string>();
    const run = async (text: string, params: unknown[] = []) => {
      statements.push(text.replace(/--[^\n]*\n/g, "").trim().split(/\s+/).slice(0, 3).join(" "));
      if (text.includes("count(*) as used")) return [{ used: "0" }];
      if (text.includes("insert into qr_codes")) {
        const shortCodes = params[1] as string[];
        return shortCodes
          .filter((code) => !existing.has(code) && !pending.has(code) && pending.add(code))
          .map((code, i) => ({ id: String(100 + pending.size + i), short_code: code }));
      }
      if (text.includes("insert into qr_bulk_imports")) return [{ id: "1" }];
      return [];
    };
    try {
      const result = await work(run);
      for (const code of pending) existing.add(code);
      return result;
    } catch (error) {
      rolledBack = true;
      throw error;
    }
  },
}));
jest.mock("@/lib/entitlement", () => ({
  ...jest.requireActual("@/lib/entitlement"),
  getEntitlement: async () => ({
    planName: "Business",
    planSlug: "business-monthly",
    maxCodes: 250,
    historyDays: 730,
    codesUsed: 0,
    features: { bulk_creation: true, custom_codes: true },
    active: true,
  }),
}));
jest.mock("@/lib/logos", () => ({ ownsLiveLogo: async () => true }));
jest.mock("@/lib/refusals", () => ({ featureRefusal: async () => "refused" }));

import { checkRows, readRows } from "@/lib/bulk-import";
import { createBulk } from "@/lib/bulk-create";
import { scopeFor } from "@/lib/account-scope";

const owner = scopeFor("user-1", "user-1", "owner");

const rows = (text: string) => {
  const read = readRows(text);
  if (!read.ok) throw new Error(read.reason);
  return checkRows(read.rows, { customLinks: true, customRefusal: "" });
};

beforeEach(() => {
  next = 0;
  existing.clear();
  statements.length = 0;
  rolledBack = false;
});

it("never sends one batch two equal codes, and retries a code the index refuses", async () => {
  existing.add("BBBBBBB");
  const made = await createBulk(owner, rows("name,destination\na,a.com\nb,b.com"), { source: "csv", logoId: null });
  // AAAAAAA is drawn twice and used once; BBBBBBB is taken, so its row is
  // retried and gets the next fresh code.
  expect(made).toEqual({ ok: true, importId: "1", created: 2 });
  expect(statements.filter((s) => s.startsWith("insert into qr_codes"))).toHaveLength(2);
  expect(existing).toEqual(new Set(["BBBBBBB", "AAAAAAA", "CCCCCCC"]));
});

it("rolls the batch back when a custom link is taken, and names the row", async () => {
  existing.add("my-shop");
  const made = await createBulk(owner, rows("name,destination,link\na,a.com,\nb,b.com,my-shop"), {
    source: "csv",
    logoId: null,
  });
  expect(made).toEqual({
    ok: false,
    reason: "Row 3: qriateplus.com/my-shop is already taken. Change or remove that link and try again. No codes were made.",
  });
  expect(rolledBack).toBe(true);
  expect(existing).toEqual(new Set(["my-shop"]));
});
