/**
 * Push every value in an env file to one Vercel environment.
 *
 *   npm run env:sync                                   # .env.local -> production
 *   npm run env:sync -- --file .env.staging --target preview
 *                                                      # staging -> previews
 *   npm run env:sync -- --only KEY                     # one variable
 *
 * Production and staging are two files and two targets, never one: Vercel's
 * Preview environment is staging (docs/qr-platform/STAGING.md), and pushing
 * .env.local into it would point every preview back at the production
 * database. So `.env.local` may only go to production, and a file going to
 * preview must not hold the production database.
 *
 * Exists because of a bug that cost a deploy: `neon deploy` writes values that
 * contain `?` or `&` in quotes, and `vercel env add` stores them verbatim
 * (see `parseEnvFile`). Values are passed on stdin and never printed.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { parseEnvFile } from "./env-file";
import { sameDatabase } from "../src/lib/staging";

const TARGETS = ["production", "preview"] as const;
type Target = (typeof TARGETS)[number];

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function main(): void {
  const only = arg("--only");
  const fileName = arg("--file") ?? ".env.local";
  const target = (arg("--target") ?? "production") as Target;
  if (!TARGETS.includes(target)) {
    console.error(`--target must be one of: ${TARGETS.join(", ")}.`);
    process.exit(1);
  }

  const file = path.join(process.cwd(), fileName);
  const env = parseEnvFile(file);

  if (env.size === 0) {
    console.error(`No values found in ${file}.`);
    process.exit(1);
  }

  if (target === "preview") {
    if (fileName === ".env.local") {
      console.error("Refusing: .env.local holds production, and Preview is staging. Use --file .env.staging.");
      process.exit(1);
    }
    const production = existsSync(".env.local") ? parseEnvFile(".env.local") : new Map<string, string>();
    const prodUrls = [production.get("DATABASE_URL"), production.get("DATABASE_URL_UNPOOLED")];
    const stagingUrls = [env.get("DATABASE_URL"), env.get("DATABASE_URL_UNPOOLED")];
    if (stagingUrls.some((s) => prodUrls.some((p) => sameDatabase(s, p)))) {
      console.error(`Refusing: ${fileName} points at the production database (the same endpoint as .env.local).`);
      process.exit(1);
    }
  } else if (fileName !== ".env.local") {
    console.error(`Refusing: only .env.local goes to production, not ${fileName}.`);
    process.exit(1);
  }

  let failures = 0;

  for (const [key, value] of env) {
    if (only && key !== only) continue;

    // Remove first: `add --force` replaces, but removing makes the result
    // the same whether or not the variable already existed.
    spawnSync("vercel", ["env", "rm", key, target, "--yes"], { encoding: "utf8" });

    const added = spawnSync("vercel", ["env", "add", key, target, "--force"], {
      input: `${value}\n`,
      encoding: "utf8",
    });

    const ok = added.status === 0;
    if (!ok) failures++;
    console.log(`  ${key.padEnd(26)} ${target.padEnd(11)} ${ok ? "ok" : "FAILED"}`);
    if (!ok) console.error(`    ${(added.stderr || "").trim().split("\n").pop()}`);
  }

  console.log(failures === 0 ? "\nAll values synced." : `\n${failures} failed.`);
  if (failures > 0) process.exit(1);
}

main();
