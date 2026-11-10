import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Team seats keep the account as the owner's user id precisely so the
 * redirect never has to know about teams. These pin that: the one query a
 * scan runs reads codes, their owner and the owner's subscription, and
 * nothing about members, invites or which account someone is looking at.
 * Membership can change at any moment without a cache purge only because
 * the redirect never reads it.
 */
const source = readFileSync(path.join(__dirname, "..", "lib", "codes.ts"), "utf8");
const lookup = source.match(/const LOOKUP_SQL = `([\s\S]*?)`;/)?.[1] ?? "";

describe("the redirect's lookup", () => {
  it("is where this test expects it", () => {
    expect(lookup).toContain("from qr_codes c");
  });

  it("reads only codes, their owner and the owner's subscription", () => {
    const tables = [...lookup.matchAll(/\b(?:from|join)\s+([a-z_]+)/g)].map((m) => m[1]).sort();
    expect(tables).toEqual(["qr_codes", "qr_subscriptions", "qr_users"]);
  });

  it("never touches team tables", () => {
    expect(source).not.toMatch(/qr_account_|qr_active_accounts/);
  });
});
