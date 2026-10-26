import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  checkCustomCode,
  generateCode,
  isValidCodeFormat,
  normaliseCode,
  RESERVED_CODES,
} from "@/lib/short-code";
import { canUseCustomCodes, type Entitlement } from "@/lib/entitlement";

/**
 * Custom codes share a URL namespace with every page on this host and with
 * every generated code. These hold the rules that keep a printed custom link
 * from ever being shadowed, mistaken for a bank, or read as the wrong code.
 */

describe("normaliseCode", () => {
  it("passes a generated code through exactly, because base-58 is case-sensitive", () => {
    expect(normaliseCode("Ab3kQ9x")).toBe("Ab3kQ9x");
  });

  it("lowercases a custom code, so a link typed in capitals still arrives", () => {
    expect(normaliseCode("DPlus")).toBe("dplus");
    expect(normaliseCode("Mama-Put-Menu")).toBe("mama-put-menu");
  });

  it("leaves every generated code unchanged", () => {
    for (let i = 0; i < 500; i += 1) {
      const code = generateCode();
      expect(normaliseCode(code)).toBe(code);
    }
  });

  it.each([
    ["too short", "abc"],
    ["too long", "a".repeat(31)],
    ["leading hyphen", "-dplus"],
    ["trailing hyphen", "dplus-"],
    ["double hyphen", "d--plus"],
    ["underscore", "d_plus"],
    ["dot", "d.plus"],
    ["path traversal", "../etc"],
    ["space", "d plus"],
    ["non-ASCII", "dplüs"],
    ["empty", ""],
  ])("rejects %s without touching the database", (_label, raw) => {
    expect(normaliseCode(raw)).toBeNull();
  });
});

describe("checkCustomCode", () => {
  it("accepts a plain business name and stores it lowercase", () => {
    expect(checkCustomCode("  DPlus ")).toEqual({ ok: true, code: "dplus" });
  });

  it("accepts 4 to 30 characters", () => {
    expect(checkCustomCode("abcd").ok).toBe(true);
    expect(checkCustomCode("a".repeat(30)).ok).toBe(true);
    expect(checkCustomCode("abc").ok).toBe(false);
    expect(checkCustomCode("a".repeat(31)).ok).toBe(false);
  });

  it.each(["app", "api", "billing", "terms", "privacy", "pricing", "acceptable-use", "not-found-code"])(
    "refuses the route name %s",
    (name) => {
      // Names shorter than four characters are refused for length, the rest
      // as reserved; either way they cannot be claimed.
      expect(checkCustomCode(name).ok).toBe(false);
    }
  );

  it.each(["gtbank-login", "verify-account", "paystack", "my-wallet", "efcc-notice", "qriateplus", "zenithbank"])(
    "refuses %s, which could pass for a bank, payment service or sign-in page",
    (name) => {
      const result = checkCustomCode(name);
      expect(result.ok).toBe(false);
    }
  );

  it("whatever it accepts, the redirect path reads back as the same code", () => {
    for (const name of ["dplus", "mama-put-menu", "shop24", "company", "a1b2"]) {
      const checked = checkCustomCode(name);
      if (!checked.ok) throw new Error(`expected ${name} to be allowed`);
      expect(normaliseCode(checked.code)).toBe(checked.code);
    }
  });

  it("can accept a 7-letter word that is also a valid generated code; the unique index keeps the two apart", () => {
    const checked = checkCustomCode("company");
    expect(checked.ok).toBe(true);
    expect(isValidCodeFormat("company")).toBe(true);
  });
});

describe("canUseCustomCodes", () => {
  const base: Entitlement = {
    planName: "Starter",
    planSlug: "starter-monthly",
    maxCodes: 10,
    historyDays: 90,
    codesUsed: 0,
    features: {},
    active: true,
  };

  it("refuses a plan without the flag and names the plans that have it", () => {
    const result = canUseCustomCodes(base);
    if (result.ok) throw new Error("expected refusal");
    expect(result.reason).toMatch(/Pro and Business/);
  });

  it("allows a plan with the flag", () => {
    expect(canUseCustomCodes({ ...base, features: { custom_codes: true } })).toEqual({ ok: true });
  });

  it("refuses an account with no plan", () => {
    expect(canUseCustomCodes(null).ok).toBe(false);
  });
});

describe("every route on this host is reserved", () => {
  /**
   * The top-level URL segments the app serves: folders under `src/app`,
   * looking through route groups like `(app)`, plus metadata files such as
   * `robots.ts` and `icon.svg`. Dynamic segments and private folders are not
   * names anyone types.
   */
  function topLevelSegments(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry.startsWith("(") && entry.endsWith(")")) {
          found.push(...topLevelSegments(full));
        } else if (!entry.startsWith("[") && !entry.startsWith("_")) {
          found.push(entry);
        }
      } else {
        const base = entry.replace(/\.(tsx?|svg|png|ico|txt|xml)$/, "");
        if (["robots", "sitemap", "icon", "opengraph-image", "apple-icon", "manifest"].includes(base)) {
          found.push(base);
        }
      }
    }
    return found;
  }

  const routes = [...new Set(topLevelSegments(path.join(__dirname, "..", "app")))];

  it("finds the routes it is meant to guard", () => {
    expect(routes).toEqual(expect.arrayContaining(["app", "api", "p", "terms", "billing"]));
  });

  it.each(routes)("%s is in RESERVED_CODES, so no code can shadow it", (route) => {
    expect(RESERVED_CODES.has(route.toLowerCase())).toBe(true);
  });
});
