/**
 * Migration runner.
 *
 *   npm run db:migrate          apply everything pending
 *   npm run db:migrate:status   report only, change nothing
 *
 * Applies each file inside a transaction and records it in `schema_migrations`
 * with a checksum. If a file that has already run has since changed, the runner
 * stops: editing an applied migration is how staging and production drift
 * apart silently.
 */
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { Pool } from "@neondatabase/serverless";

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

const BOOTSTRAP = `
  create table if not exists schema_migrations (
    version     text        primary key,
    applied_at  timestamptz not null default now(),
    checksum    text        not null
  )
`;

type Migration = { version: string; file: string; sql: string; checksum: string };

async function load(): Promise<Migration[]> {
  const entries = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  return Promise.all(
    entries.map(async (file) => {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      return {
        version: file.replace(/\.sql$/, ""),
        file,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex").slice(0, 16),
      };
    })
  );
}

async function main(): Promise<void> {
  const statusOnly = process.argv.includes("--status");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      "DATABASE_URL is not set.\n" +
        "Add it to .env.local (see .env.example) and re-run.\n" +
        "Scripts are run with `tsx --env-file=.env.local`, so a missing file is a silent empty env."
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString });

  try {
    await pool.query(BOOTSTRAP);

    const migrations = await load();
    const { rows } = await pool.query<{ version: string; checksum: string }>(
      "select version, checksum from schema_migrations"
    );
    const applied = new Map(rows.map((r) => [r.version, r.checksum]));

    // Drift check before applying anything.
    const drifted = migrations.filter(
      (m) => applied.has(m.version) && applied.get(m.version) !== m.checksum
    );
    if (drifted.length > 0) {
      console.error("These applied migrations have been edited since they ran:");
      for (const m of drifted) console.error(`  ${m.file}`);
      console.error(
        "\nMigrations are append-only. Revert the edit and add a new migration instead."
      );
      process.exit(1);
    }

    const pending = migrations.filter((m) => !applied.has(m.version));

    if (statusOnly) {
      console.log(`applied: ${applied.size}   pending: ${pending.length}\n`);
      for (const m of migrations) {
        console.log(`  ${applied.has(m.version) ? "✓" : "·"} ${m.file}`);
      }
      return;
    }

    if (pending.length === 0) {
      console.log("Nothing to apply.");
      return;
    }

    for (const m of pending) {
      process.stdout.write(`applying ${m.file} … `);
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(m.sql);
        await client.query(
          "insert into schema_migrations (version, checksum) values ($1, $2)",
          [m.version, m.checksum]
        );
        await client.query("commit");
        console.log("ok");
      } catch (error) {
        await client.query("rollback").catch(() => {});
        console.log("failed");
        throw error;
      } finally {
        client.release();
      }
    }

    console.log(`\nApplied ${pending.length} migration(s).`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("\nMigration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
