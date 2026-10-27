/**
 * Migration runner.
 *
 *   npm run db:migrate          apply everything pending
 *   npm run db:migrate:status   report only, change nothing
 *   tsx scripts/migrate.ts --deploy
 *                               what `npm run build` runs first: applies on a
 *                               Vercel production build, reports on a preview,
 *                               does nothing locally (src/lib/migration-mode.ts)
 *
 * Applies each file inside a transaction and records it in `schema_migrations`
 * with a checksum. If a file that has already run has since changed, the runner
 * stops: editing an applied migration is how staging and production drift
 * apart silently.
 */
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { Pool } from "pg";
import { migrationModeFor } from "../src/lib/migration-mode";

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

/**
 * One key for every runner, so two production deploys that overlap (two
 * merges in quick succession) apply migrations one after the other instead
 * of racing to insert the same `schema_migrations` row.
 */
const LOCK_KEY = 72_042_713;

/**
 * How long a migration may wait for a table lock before giving up.
 *
 * `alter table qr_codes ...` needs a brief exclusive lock on the table every
 * scan reads. If a long query holds it, the ALTER waits, and every scan that
 * arrives after it queues behind the waiting ALTER: a migration that cannot
 * get its lock quickly stalls the redirect path. Failing the deploy is the
 * better outcome. Set per transaction, so a manual run is protected too.
 */
const LOCK_TIMEOUT = "5s";

async function main(): Promise<void> {
  const deploy = process.argv.includes("--deploy");
  const mode = deploy ? migrationModeFor(process.env) : null;

  if (mode === "skip") {
    console.log("[migrate] not a Vercel build; skipping migrations.");
    return;
  }

  const statusOnly = process.argv.includes("--status") || mode === "check";
  if (mode === "check") {
    console.log(
      `[migrate] ${process.env.VERCEL_ENV ?? "unknown"} build: reporting only. ` +
        "Migrations are applied by production deploys, never by previews, " +
        "because previews share the production database."
    );
  } else if (mode === "apply") {
    console.log("[migrate] production build: applying pending migrations before next build.");
  }

  // Migrations MUST use the direct (unpooled) connection. Over PgBouncer in
  // transaction mode, DDL and session state fail in ways that never mention
  // pooling: a search_path that does not outlive its own statement, or a
  // "prepared statement already exists" from a reused backend.
  const connectionString =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

  if (!connectionString) {
    if (mode === "check") {
      console.warn("[migrate] no database connection configured; nothing to report.");
      return;
    }
    console.error(
      "DATABASE_URL_UNPOOLED is not set.\n" +
        "Run `neon env pull`, or see .env.example.\n" +
        "Scripts are run with `tsx --env-file=.env.local`, so a missing file is a silent empty env."
    );
    process.exit(1);
  }

  if (!process.env.DATABASE_URL_UNPOOLED && connectionString.includes("-pooler")) {
    if (mode === "check") {
      console.warn("[migrate] only a pooled connection is configured; nothing to report.");
      return;
    }
    console.error(
      "Refusing to migrate over a pooled connection.\n" +
        "DATABASE_URL points at a -pooler host and DATABASE_URL_UNPOOLED is unset.\n" +
        "Run `neon env pull` to get the direct connection string."
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  // Held for the whole run. A session-level advisory lock needs a direct
  // connection, which is one more reason this refuses the pooler.
  const lock = await pool.connect();

  try {
    await lock.query("select pg_advisory_lock($1)", [LOCK_KEY]);

    // Reporting writes nothing, not even the bookkeeping table: a preview
    // that only checks must leave the database exactly as it found it.
    if (statusOnly) {
      const { rows: found } = await pool.query<{ exists: boolean }>(
        "select to_regclass('schema_migrations') is not null as exists"
      );
      if (!found[0]?.exists) {
        const all = await load();
        console.log(`applied: 0   pending: ${all.length}\n`);
        for (const m of all) console.log(`  · ${m.file}`);
        return;
      }
    } else {
      await pool.query(BOOTSTRAP);
    }

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
      if (mode === "check" && pending.length > 0) {
        console.log(
          `\n[migrate] warning: ${pending.length} migration(s) pending. This preview may fail ` +
            "wherever it reads them; they apply when this change deploys to production."
        );
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
        await client.query(`set local lock_timeout = '${LOCK_TIMEOUT}'`);
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
    await lock.query("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    lock.release();
    await pool.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : error;
  // A preview only reports, so a database it cannot reach is a warning, not a
  // failed build. (An edited migration still fails it, above: that is a real
  // problem in the change being previewed.)
  if (process.argv.includes("--deploy") && migrationModeFor(process.env) === "check") {
    console.warn("\n[migrate] could not check pending migrations:", message);
    process.exit(0);
  }
  console.error("\nMigration failed:", message);
  process.exit(1);
});
