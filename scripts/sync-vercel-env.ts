/**
 * Push every value in .env.local to the linked Vercel project.
 *
 *   npx tsx scripts/sync-vercel-env.ts            # production + preview
 *   npx tsx scripts/sync-vercel-env.ts --only KEY # one variable
 *
 * Exists because of a bug that cost a deploy: `neon deploy` writes values that
 * contain `?` or `&` in quotes (`DATABASE_URL="postgres://…"`). Local loaders
 * strip those quotes; `vercel env add` does not. The quoted string was stored
 * verbatim, so `pg` parsed the host as "base" and reported `ENOTFOUND base` --
 * while storage and auth, whose values were unquoted, came up healthy and hid
 * the problem.
 *
 * Values are passed on stdin and never printed.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const TARGETS = ["production", "preview"] as const;

/** Values are never logged, so this list is about intent, not secrecy. */
function parseEnvFile(file: string): Map<string, string> {
  const result = new Map<string, string>();

  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    // The whole point of this script.
    if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    }

    // An empty value is a declared-but-unset variable, not something to push.
    if (value) result.set(key, value);
  }

  return result;
}

function main(): void {
  const onlyIndex = process.argv.indexOf("--only");
  const only = onlyIndex === -1 ? null : process.argv[onlyIndex + 1];

  const file = path.join(process.cwd(), ".env.local");
  const env = parseEnvFile(file);

  if (env.size === 0) {
    console.error(`No values found in ${file}.`);
    process.exit(1);
  }

  let failures = 0;

  for (const [key, value] of env) {
    if (only && key !== only) continue;

    for (const target of TARGETS) {
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
  }

  console.log(failures === 0 ? "\nAll values synced." : `\n${failures} failed.`);
  if (failures > 0) process.exit(1);
}

main();
