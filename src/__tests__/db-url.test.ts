import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "pg-connection-string";
import { pinSslMode } from "@/lib/db-url";

/**
 * `pg` 8 checks the certificate for `sslmode=require` but warns that `pg` 9
 * will not. These hold the explicit `verify-full` in place, and hold every
 * pool in the repo to using it.
 */

// The shape Neon writes, with a password that has to survive untouched.
const NEON =
  "postgresql://app:p%40ss%2Fw0rd@ep-cool-name-123-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

describe("pinSslMode", () => {
  it("turns require into verify-full and changes nothing else", () => {
    expect(pinSslMode(NEON)).toBe(NEON.replace("sslmode=require", "sslmode=verify-full"));
  });

  it.each(["prefer", "require", "verify-ca"])("pins %s", (mode) => {
    expect(pinSslMode(`postgres://h/db?sslmode=${mode}`)).toBe("postgres://h/db?sslmode=verify-full");
  });

  it("finds the mode wherever it sits in the query", () => {
    expect(pinSslMode("postgres://h/db?channel_binding=require&sslmode=require")).toBe(
      "postgres://h/db?channel_binding=require&sslmode=verify-full"
    );
  });

  it.each([
    ["already verify-full", "postgres://h/db?sslmode=verify-full"],
    ["disabled, for a local database", "postgres://localhost/db?sslmode=disable"],
    ["explicitly unverified", "postgres://h/db?sslmode=no-verify"],
    ["no mode at all", "postgres://localhost:5432/qr"],
    ["a lookalike parameter", "postgres://h/db?xsslmode=require"],
    ["a longer value", "postgres://h/db?sslmode=requirex"],
  ])("leaves %s alone", (_label, url) => {
    expect(pinSslMode(url)).toBe(url);
  });

  it("is read by pg as a verified connection, without the warning", () => {
    const warn = jest.spyOn(process, "emitWarning").mockImplementation(() => {});
    try {
      const config = parse(pinSslMode(NEON));
      expect(config.sslmode).toBe("verify-full");
      // An ssl object with no `rejectUnauthorized: false` is Node's default:
      // the chain and the hostname are both checked.
      expect(config.ssl).toEqual({});
      expect(config.password).toBe("p@ss/w0rd");
      expect(config.host).toBe("ep-cool-name-123-pooler.eu-central-1.aws.neon.tech");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("every Postgres pool in the repo", () => {
  const ROOT = path.join(__dirname, "..", "..");

  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
      .map((entry) => path.join(entry.parentPath, entry.name))
      .filter((file) => !file.includes(`${path.sep}__tests__${path.sep}`));
  }

  it("passes its connection string through pinSslMode", () => {
    const files = [...sources(path.join(ROOT, "src")), ...sources(path.join(ROOT, "scripts"))];
    const constructions = files.flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/new (?:Pool|Client)\(\{[^}]*\}/g)].map((match) => ({
        file: path.relative(ROOT, file),
        code: match[0],
      }))
    );

    // Guard against the check passing because the regex stopped matching.
    expect(constructions.length).toBeGreaterThanOrEqual(5);
    for (const { file, code } of constructions) {
      expect({ file, pinned: /connectionString:\s*pinSslMode\(/.test(code) }).toEqual({ file, pinned: true });
    }
  });
});
