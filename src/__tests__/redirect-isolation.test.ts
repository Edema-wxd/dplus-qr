import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Guards the one rule that cannot be enforced by types: the redirect path stays
 * lean. The dashboard, its components and its dependencies must never end up in
 * the module graph of the route that serves printed codes.
 *
 * This is a source-level check rather than a bundle check so it runs in the unit
 * suite and fails fast, before review.
 */

const ROOT = path.join(__dirname, "..");
const REDIRECT_ROUTE = path.join(ROOT, "app", "[code]", "route.ts");

function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const pattern = /from\s+["']([^"']+)["']/g;
  const found: string[] = [];
  for (const match of source.matchAll(pattern)) {
    found.push(match[1]);
  }
  return found;
}

/** Resolve a local import to a file on disk, or null for a package. */
function resolveLocal(specifier: string): string | null {
  if (!specifier.startsWith("@/")) return null;
  const base = path.join(ROOT, specifier.slice(2));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function transitiveLocalImports(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    for (const specifier of importsOf(file)) {
      const resolved = resolveLocal(specifier);
      if (resolved) queue.push(resolved);
    }
  }

  seen.delete(entry);
  return seen;
}

describe("redirect route isolation", () => {
  it("exists where the route conventions expect it", () => {
    expect(existsSync(REDIRECT_ROUTE)).toBe(true);
  });

  it("imports nothing from the component or dashboard trees", () => {
    const reached = [...transitiveLocalImports(REDIRECT_ROUTE)].map((f) =>
      path.relative(ROOT, f)
    );

    const forbidden = reached.filter(
      (f) => f.startsWith("components/") || f.startsWith("app/")
    );

    expect(forbidden).toEqual([]);
  });

  // Both are `lib/` modules, so "only lib modules" below would let them in.
  // The dashboard's data layer and its Realtime sealing have no business on
  // the path a printed code takes, and live-codes holds the Realtime secret.
  it("never reaches the dashboard data layer or Realtime", () => {
    const reached = [...transitiveLocalImports(REDIRECT_ROUTE)].map((f) =>
      path.relative(ROOT, f)
    );

    expect(
      reached.filter((f) => /^lib\/(user-codes|live-codes)\b/.test(f))
    ).toEqual([]);
  });

  it("reaches only lib modules", () => {
    const reached = [...transitiveLocalImports(REDIRECT_ROUTE)].map((f) =>
      path.relative(ROOT, f)
    );

    expect(reached.length).toBeGreaterThan(0);
    for (const file of reached) {
      expect(file.startsWith("lib/")).toBe(true);
    }
  });

  it("pulls in no React or UI package", () => {
    const entry = [REDIRECT_ROUTE, ...transitiveLocalImports(REDIRECT_ROUTE)];
    const packages = entry.flatMap((file) =>
      importsOf(file).filter((s) => !s.startsWith("@/") && !s.startsWith("."))
    );

    for (const pkg of packages) {
      expect(pkg).not.toMatch(/^react/);
      expect(pkg).not.toMatch(/^next\/(image|font|link)/);
    }
  });

  it("returns 302, never 301", () => {
    const source = readFileSync(REDIRECT_ROUTE, "utf8");
    expect(source).toContain("status: 302");
    // A 301 is cached permanently by the browser, so a later destination
    // change would never reach anyone who already scanned.
    expect(source).not.toMatch(/status:\s*301/);
  });

  it("sets no-store on every response it builds", () => {
    const source = readFileSync(REDIRECT_ROUTE, "utf8");
    expect(source).toContain("no-store");
  });

  it("fails soft when the lookup throws, instead of surfacing a 500", () => {
    const source = readFileSync(REDIRECT_ROUTE, "utf8");
    // A database outage must land the scanner on a branded "try again" page,
    // never a crash page and never the not-found page.
    expect(source).toMatch(/catch[\s\S]{0,200}\/unavailable/);
  });

  it("records the scan in after(), not before the response", () => {
    const source = readFileSync(REDIRECT_ROUTE, "utf8");
    expect(source).toMatch(/after\(\(\)\s*=>\s*recordScan/);
    // recordScan must never be awaited inline on the redirect path.
    expect(source).not.toMatch(/await\s+recordScan/);
  });
});
