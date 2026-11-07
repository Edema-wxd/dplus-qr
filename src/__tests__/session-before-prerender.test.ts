import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Every page or server component that reads the session waits for the
 * request first.
 *
 * With Cache Components on, Next prerenders what it can of a page. A session
 * read that has to ask Neon Auth (its five-minute cache has run out) starts a
 * fetch, and inside a prerender that fetch is cut off when the prerender
 * ends. Production logged exactly that on `/app/[id]`, the one page missing
 * `await connection()`: "During prerendering, fetch() rejects when the
 * prerender is complete". Awaiting `connection()` first tells Next this needs
 * a live request, so the read only ever runs in one.
 *
 * Route handlers and Server Actions always run in a request, so they are left
 * out.
 */

const APP = path.join(__dirname, "..", "app");

function components(): string[] {
  return readdirSync(APP, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

const directive = (source: string) => source.match(/^\s*["'](use (?:client|server))["']/)?.[1];

describe("reading the session in a page or server component", () => {
  const readers = components()
    .map((file) => ({ file, source: readFileSync(file, "utf8") }))
    .filter(({ source }) => directive(source) === undefined && source.includes("auth.getSession("));

  it("is found, so the check below is checking something", () => {
    expect(readers.length).toBeGreaterThanOrEqual(5);
  });

  it.each(readers.map(({ file, source }) => [path.relative(APP, file), source]))(
    "%s awaits connection() before it",
    (_file, source) => {
      const session = source.indexOf("auth.getSession(");
      const connection = source.indexOf("await connection()");
      expect(connection).toBeGreaterThanOrEqual(0);
      expect(connection).toBeLessThan(session);
    }
  );
});
