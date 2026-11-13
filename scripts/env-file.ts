import { readFileSync } from "node:fs";

/**
 * Read a dotenv file the way the local loaders do, quotes stripped.
 *
 * `neon deploy` writes values that contain `?` or `&` in quotes
 * (`DATABASE_URL="postgres://…"`). Local loaders strip them; `vercel env add`
 * and `pg` do not, so a quoted value handed on verbatim resolves the host as
 * "base" (ENOTFOUND base). An empty value is a declared-but-unset variable
 * and is left out.
 */
export function parseEnvFile(file: string): Map<string, string> {
  const result = new Map<string, string>();

  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    }

    if (value) result.set(key, value);
  }

  return result;
}
