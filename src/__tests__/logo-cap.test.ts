/**
 * Audit L10: the 50-logo cap holds against uploads finishing together. The
 * upload middleware's count is only a fast refusal; `recordLogo` counts
 * again under a per-account lock and refuses the one that would go over.
 */
type Rows = Record<string, unknown>[];
const statements: string[] = [];
let live = 0;
let existing: Rows = [];

jest.mock("sharp", () => jest.fn());
jest.mock("@/lib/db", () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  withTransaction: async <T,>(fn: (run: (t: string, p?: unknown[]) => Promise<Rows>) => Promise<T>) =>
    fn(async (text) => {
      statements.push(text);
      if (text.includes("pg_advisory_xact_lock")) return [];
      if (text.includes("where file_key = $1")) return existing;
      if (text.includes("count(*)")) return [{ n: String(live) }];
      if (text.includes("insert into qr_logos")) {
        live += 1;
        return [{ id: "9", url: "https://fmctfyekk3.ufs.sh/f/k", name: "logo.png", created_at: new Date() }];
      }
      return [];
    }),
}));

import { LogoLimitError, MAX_LOGOS, recordLogo } from "@/lib/logos";

const file = { key: "k", url: "https://fmctfyekk3.ufs.sh/f/k", name: "logo.png", type: "image/png", size: 100 };

beforeEach(() => {
  statements.length = 0;
  existing = [];
});

it("locks the account before counting, and records under the cap", async () => {
  live = MAX_LOGOS - 1;
  await expect(recordLogo("acct", file)).resolves.toMatchObject({ id: "9" });
  expect(statements[0]).toContain("pg_advisory_xact_lock");
  expect(statements.findIndex((s) => s.includes("count(*)"))).toBeLessThan(
    statements.findIndex((s) => s.includes("insert into qr_logos"))
  );
});

it("refuses the upload that would go over, without inserting it", async () => {
  live = MAX_LOGOS;
  await expect(recordLogo("acct", file)).rejects.toBeInstanceOf(LogoLimitError);
  expect(statements.some((s) => s.includes("insert into qr_logos"))).toBe(false);
});

it("returns a repeated callback's row even when the library is full", async () => {
  live = MAX_LOGOS;
  existing = [{ id: "9", url: file.url, name: "logo.png", created_at: new Date() }];
  await expect(recordLogo("acct", file)).resolves.toMatchObject({ id: "9" });
});
