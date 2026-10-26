import { readFileSync } from "node:fs";
import path from "node:path";
import { DEMO_CODE, DEMO_DESTINATION } from "@/lib/demo-code";
import { isReserved, isValidCodeFormat, generateCode } from "@/lib/short-code";

/**
 * The specimen on the landing page is a real printed symbol on a public page,
 * so a scan of it has to resolve. It has no row in `qr_codes`, which sent
 * every scan of the page's central claim to the not-found page; the redirect
 * path now answers it from a constant. These tests hold the three things that
 * arrangement depends on.
 */

const ROOT = path.join(__dirname, "..");
const REDIRECT_ROUTE = path.join(ROOT, "app", "[code]", "route.ts");
const LANDING_PAGE = path.join(ROOT, "app", "page.tsx");

describe("the landing page specimen", () => {
  it("is a code the generator could have produced", () => {
    // If it were malformed the route would reject it at the format check and
    // never reach the short-circuit below.
    expect(isValidCodeFormat(DEMO_CODE)).toBe(true);
  });

  it("can never be issued to an account", () => {
    // The redirect path answers it before any lookup, so an account holding it
    // would own a code that never reaches their destination.
    expect(isReserved(DEMO_CODE)).toBe(true);
  });

  it("is never returned by the generator", () => {
    for (let i = 0; i < 2000; i += 1) {
      expect(generateCode()).not.toBe(DEMO_CODE);
    }
  });

  it("does not collide with the page it redirects to", () => {
    expect(isReserved(DEMO_DESTINATION.replace(/^\//, ""))).toBe(true);
  });
});

describe("the redirect path answers the specimen", () => {
  const source = readFileSync(REDIRECT_ROUTE, "utf8");

  it("short-circuits on it", () => {
    expect(source).toMatch(/code === DEMO_CODE/);
  });

  it("answers it before the database is touched", () => {
    const shortCircuit = source.indexOf("code === DEMO_CODE");
    const lookup = source.indexOf("lookupDestination(code)");
    expect(shortCircuit).toBeGreaterThan(-1);
    expect(lookup).toBeGreaterThan(-1);
    // A constant comparison cannot fail; a lookup can. The specimen must
    // resolve on a deployment with no database reachable at all.
    expect(shortCircuit).toBeLessThan(lookup);
  });

  it("reaches the specimen constant without importing the landing copy", () => {
    // `landing.ts` is the page's whole prose deck. Pulling it onto the
    // redirect path would put the surface's copy in the scanner's module graph.
    expect(source).toContain('from "@/lib/demo-code"');
    expect(source).not.toContain('from "@/lib/landing"');
  });
});

describe("the hero symbol", () => {
  const source = readFileSync(LANDING_PAGE, "utf8");

  it("encodes the code its caption prints, not the bare origin", () => {
    // It encoded `CODE_ORIGIN` while captioned `qriateplus.com/Ab3kQ9x`, so
    // scanning the page's central claim returned the visitor to the page.
    const hero = source.slice(source.indexOf("px={312}") - 400, source.indexOf("px={312}"));
    expect(hero).toContain("value={codeUrl}");
    expect(hero).not.toContain("value={CODE_ORIGIN}");
  });
});
