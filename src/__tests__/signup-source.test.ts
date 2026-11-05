import { readFileSync } from "node:fs";
import path from "node:path";

const queryOne = jest.fn();
jest.mock("@/lib/db", () => ({
  query: jest.fn(async () => []),
  queryOne: (...args: unknown[]) => queryOne(...args),
}));

import { parseSignupRef, recordSignupSource } from "@/lib/signup-source";
import { SIGNUP_REF_PARAM, signupLinkFor } from "@/lib/signup-ref";
import { LINK_KINDS } from "@/lib/qr-types";

/**
 * The "Powered by QRiate+" footer credits a sign-up to the page that sent it.
 * These hold the three things that depends on: the link carries the code,
 * the form's value is cleaned before it reaches SQL, and only a hosted page
 * can be credited.
 */

describe("the footer's sign-up link", () => {
  it("carries the page's code in the parameter the form reads", () => {
    expect(signupLinkFor("Ab3dEf9")).toBe(`/auth/sign-up?${SIGNUP_REF_PARAM}=Ab3dEf9`);
  });

  it("encodes the code rather than trusting it", () => {
    expect(signupLinkFor("a&b=c")).toBe(`/auth/sign-up?${SIGNUP_REF_PARAM}=a%26b%3Dc`);
  });

  it("is what every hosted page's footer links to", () => {
    const page = readFileSync(path.join(__dirname, "..", "app", "p", "[code]", "page.tsx"), "utf8");
    expect(page).toMatch(/href=\{signupLinkFor\(code\)\}/);
    expect(page).toMatch(/Powered by/);
  });
});

describe("parseSignupRef", () => {
  it("keeps a generated short code as it is", () => {
    expect(parseSignupRef("Ab3dEf9")).toBe("Ab3dEf9");
  });

  it("keeps a custom code, lower-cased", () => {
    expect(parseSignupRef("  Bella-Cafe ")).toBe("bella-cafe");
  });

  it.each([
    ["missing", null],
    ["not text", 42],
    ["empty", "   "],
    ["SQL", "x'; drop table qr_users;--"],
    ["a path", "../admin"],
    ["far too long", "a".repeat(65)],
  ])("ignores a value that is %s", (_label, value) => {
    expect(parseSignupRef(value)).toBeNull();
  });
});

describe("recordSignupSource", () => {
  beforeEach(() => queryOne.mockReset());

  it("credits only a code whose kind has a hosted page", async () => {
    queryOne.mockResolvedValue({ user_id: "u1" });
    await expect(recordSignupSource("u1", "Ab3dEf9")).resolves.toBe(true);

    const [sql, params] = queryOne.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/from qr_codes c\s+where c\.short_code = \$2 and c\.kind = any\(\$3::text\[\]\)/);
    expect(sql).toMatch(/on conflict \(user_id\) do nothing/);

    const kinds = params[2] as string[];
    expect(kinds).toEqual(expect.arrayContaining(["pdf", "images", "menu"]));
    // A link code redirects straight to someone else's site, so it has no
    // footer and cannot have sent anyone.
    for (const kind of LINK_KINDS) expect(kinds).not.toContain(kind);
  });

  it("reports nothing recorded when the code is not a page", async () => {
    queryOne.mockResolvedValue(null);
    await expect(recordSignupSource("u1", "nopage1")).resolves.toBe(false);
  });
});
