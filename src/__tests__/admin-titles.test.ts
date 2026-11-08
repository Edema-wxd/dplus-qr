import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * No admin page names the admin in its title. The title is in the prerendered
 * shell, and when `proxy.ts` cannot tell who is staff it lets that shell go
 * out to whoever asked, before `requireStaff()` refuses them. See DECISIONS.md,
 * 7 November 2026.
 *
 * A source-level check, like redirect-isolation.test.ts, so a new admin page
 * with "· Admin" in its title fails here rather than in production.
 */

const ADMIN = path.join(__dirname, "..", "app", "(admin)", "admin");

function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return pages(full);
    return entry.name === "page.tsx" ? [full] : [];
  });
}

function titleOf(file: string): string | null {
  const source = readFileSync(file, "utf8");
  return /export const metadata[^=]*=\s*\{[^}]*title:\s*"([^"]*)"/.exec(source)?.[1] ?? null;
}

describe("admin page titles", () => {
  const files = pages(ADMIN);

  it("finds the admin pages", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((file) => [path.relative(ADMIN, file), file]))(
    "%s has a static title that does not name the admin",
    (_name, file) => {
      const title = titleOf(file);
      // A page with no static title would be a new pattern, and worth a look.
      expect(title).not.toBeNull();
      expect(title).not.toMatch(/admin|staff/i);
    }
  );
});
