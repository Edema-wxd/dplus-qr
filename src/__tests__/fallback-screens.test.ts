import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Source-level guards for the loading and error screens.
 *
 * These are conventions the compiler cannot see: Next.js discovers the files
 * by name, so a renamed or deleted boundary fails silently -- the app falls
 * back to the framework's own unbranded screen, and nobody notices until a
 * client does. Each assertion below is a thing that broke, or would have.
 */

const APP = path.join(__dirname, "..", "app");
const STYLES = path.join(APP, "globals.css");

const read = (...segments: string[]) =>
  readFileSync(path.join(APP, ...segments), "utf8");

/** Every route group that renders pages needs both boundaries. */
const SEGMENTS = [".", "(app)", "(status)"];

describe("loading screens", () => {
  it.each(SEGMENTS)("%s has a loading boundary", (segment) => {
    expect(existsSync(path.join(APP, segment, "loading.tsx"))).toBe(true);
  });

  it.each(SEGMENTS)("%s renders the shared screen rather than its own", (segment) => {
    expect(read(segment, "loading.tsx")).toContain("LoadingScreen");
  });

  it("animates with CSS only, so it runs inside a streamed fallback", () => {
    // A Suspense fallback is on screen before any JavaScript has loaded. A
    // `"use client"` loader, or one driven by a hook, would show nothing.
    const mark = readFileSync(path.join(__dirname, "..", "components", "QrMark.tsx"), "utf8");
    expect(mark.trimStart()).not.toMatch(/^["']use client["']/);
    expect(mark).not.toMatch(/\buseState|useEffect|requestAnimationFrame\b/);
  });

  it("only animates properties the compositor can handle alone", () => {
    const css = readFileSync(STYLES, "utf8");
    const start = css.indexOf("@keyframes qr-module");
    const keyframes = css.slice(start, css.indexOf("}\n", css.indexOf("100%", start)));
    const animated = [...keyframes.matchAll(/^\s{4}([a-z-]+):/gm)].map((m) => m[1]);
    expect(animated.length).toBeGreaterThan(0);
    for (const property of animated) {
      expect(["opacity", "transform"]).toContain(property);
    }
  });

  it("stands down for anyone who asked for reduced motion", () => {
    const css = readFileSync(STYLES, "utf8");
    const query = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(query).toContain(".qr-module");
    expect(query).toMatch(/animation:\s*none/);
  });
});

describe("error screens", () => {
  const boundaries = ["error.tsx", path.join("(status)", "error.tsx"), "global-error.tsx"];

  it.each(boundaries)("%s is a client component", (file) => {
    // Error boundaries must be Client Components; a server one fails at build.
    expect(read(file).trimStart()).toMatch(/^["']use client["']/);
  });

  it.each(boundaries)("%s offers recovery through retry, not reset", (file) => {
    // Next 16 renamed the prop. `reset` still exists but only clears the error
    // state without re-fetching, so it re-renders straight back into failure.
    const source = read(file);
    expect(source).toContain("retry");
    expect(source).not.toMatch(/\breset\b/);
  });

  it.each(boundaries)("%s never prints the thrown message", (file) => {
    // In development the message carries details that do not belong on a page,
    // and in production it is generic anyway. The digest is what is useful.
    expect(read(file)).not.toMatch(/error\.message/);
  });

  it("surfaces the digest so a report can be matched to the logs", () => {
    expect(read("error.tsx")).toContain("errorReference");
    expect(read("global-error.tsx")).toContain("digest");
  });

  it("global-error renders its own document", () => {
    // It replaces the root layout when active, so the document is its job.
    const source = read("global-error.tsx");
    expect(source).toContain("<html");
    expect(source).toContain("<body");
  });

  it("global-error depends on nothing but the brand constants", () => {
    // globals.css, the fonts and the Tailwind tokens are all gone by the time
    // this renders. Anything else imported here could be the thing that broke.
    const source = read("global-error.tsx");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(imports).toEqual(["@/lib/brand"]);
  });

  it("keeps the status-group failure calm rather than alarming", () => {
    // Whoever reads it scanned a printed code in good faith and has now hit
    // two failures in a row. Red would tell them the code is bad; it is not.
    const source = read("(status)", "error.tsx");
    expect(source).toContain('accent="yellow"');
  });

  it("has a not-found page of its own", () => {
    expect(existsSync(path.join(APP, "not-found.tsx"))).toBe(true);
  });
});
