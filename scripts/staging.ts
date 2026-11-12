/**
 * Look after the staging database (docs/qr-platform/STAGING.md).
 *
 *   npm run staging -- status                 what is there, and is it marked
 *   npm run staging -- mark                   mark this database as staging
 *   npm run staging -- reset --yes            empty it and rebuild the schema
 *   npm run staging -- seed --email you@...  make that account staff, on the
 *                                             top plan, with sample codes
 *
 * Reads the staging connection strings from `.env.staging`, and production's
 * from `.env.local` only to refuse them: every command stops if the two point
 * at the same database. `reset` and `seed` also stop unless the database
 * itself is marked staging (`mark`), so neither can ever touch production.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { Pool } from "pg";
import { parseEnvFile } from "./env-file";
import { pinSslMode } from "../src/lib/db-url";
import { generateCode } from "../src/lib/short-code";
import { STAGING_SETTING, STAGING_VALUE } from "../src/lib/migration-mode";
import { STAGING_HOST, databaseEndpoint, sameDatabase } from "../src/lib/staging";

const STAGING_FILE = ".env.staging";

/**
 * Neon Auth's tables that hold people, children first. Its signing keys
 * (`jwks`) and configuration are left alone, or sign-in on staging stops.
 * Only those that exist are touched: the service owns this schema.
 */
const AUTH_TABLES_WITH_PEOPLE = ["session", "account", "verification", "invitation", "member", "organization", "user"];

const SAMPLE_CODES = [
  { name: "Staging: active link", url: "https://example.com/staging-active", status: "active" },
  { name: "Staging: paused link", url: "https://example.com/staging-paused", status: "paused" },
  { name: "Staging: blocked link", url: "https://example.com/staging-blocked", status: "blocked" },
] as const;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** The staging direct URL, after refusing anything that reaches production. */
function stagingUrl(): string {
  const file = path.join(process.cwd(), STAGING_FILE);
  if (!existsSync(file)) {
    fail(`${STAGING_FILE} not found. Put the staging branch's connection strings in it (STAGING.md, step 2).`);
  }
  const staging = parseEnvFile(file);
  const url = staging.get("DATABASE_URL_UNPOOLED");
  if (!url) fail(`${STAGING_FILE} has no DATABASE_URL_UNPOOLED. The direct connection is needed.`);
  if (url.includes("-pooler")) fail(`DATABASE_URL_UNPOOLED in ${STAGING_FILE} is a pooled (-pooler) URL.`);

  const production = existsSync(".env.local") ? parseEnvFile(".env.local") : new Map<string, string>();
  for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) {
    for (const stagingKey of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) {
      if (sameDatabase(staging.get(stagingKey), production.get(key))) {
        fail(`Refusing: ${STAGING_FILE} ${stagingKey} is the production database (${key} in .env.local).`);
      }
    }
  }
  return url;
}

async function withPool<T>(url: string, run: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: pinSslMode(url), max: 2 });
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

/** Read the mark on a fresh connection: `alter database` reaches new sessions only. */
async function isMarked(url: string): Promise<boolean> {
  return withPool(url, async (pool) => {
    const { rows } = await pool.query<{ value: string | null }>("select current_setting($1, true) as value", [
      STAGING_SETTING,
    ]);
    return rows[0]?.value === STAGING_VALUE;
  });
}

async function requireMarked(url: string): Promise<void> {
  if (!(await isMarked(url))) {
    fail("This database is not marked staging. If it is the staging branch, run `npm run staging -- mark` first.");
  }
}

async function status(url: string): Promise<void> {
  const marked = await isMarked(url);
  await withPool(url, async (pool) => {
    const table = async (name: string) =>
      (await pool.query<{ ok: boolean }>("select to_regclass($1) is not null as ok", [name])).rows[0].ok;
    const count = async (sql: string) => Number((await pool.query<{ n: string }>(sql)).rows[0].n);
    console.log(`database      ${databaseEndpoint(url)}`);
    console.log(`marked        ${marked ? "yes, staging" : "NO"}`);
    if (await table("public.schema_migrations")) {
      const { rows } = await pool.query<{ n: string; latest: string | null }>(
        "select count(*) as n, max(version) as latest from schema_migrations"
      );
      console.log(`migrations    ${rows[0].n} applied, latest ${rows[0].latest ?? "none"}`);
    } else {
      console.log("migrations    none applied");
    }
    if (await table("public.qr_users")) console.log(`accounts      ${await count("select count(*) as n from qr_users")}`);
    if (await table("public.qr_codes")) console.log(`codes         ${await count("select count(*) as n from qr_codes")}`);
  });
}

async function mark(url: string): Promise<void> {
  await withPool(url, async (pool) => {
    const { rows } = await pool.query<{ sql: string }>("select format('alter database %I set %s = %L', current_database(), $1::text, $2::text) as sql", [
      STAGING_SETTING,
      STAGING_VALUE,
    ]);
    await pool.query(rows[0].sql);
  });
  if (!(await isMarked(url))) fail("The mark did not take. Is the role in .env.staging the database owner?");
  console.log(`Marked ${databaseEndpoint(url)} as staging. Previews will now apply migrations to it.`);
}

async function reset(url: string, confirmed: boolean): Promise<void> {
  await requireMarked(url);
  if (!confirmed) {
    console.log(
      `This empties ${databaseEndpoint(url)}: every table in public is dropped and rebuilt from\n` +
        "db/migrations, and every account is removed from Neon Auth. Run again with --yes."
    );
    return;
  }

  await withPool(url, async (pool) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("drop schema if exists public cascade");
      await client.query("create schema public");
      for (const name of AUTH_TABLES_WITH_PEOPLE) {
        const { rows } = await client.query<{ ok: boolean }>("select to_regclass($1) is not null as ok", [
          `neon_auth."${name}"`,
        ]);
        if (rows[0].ok) await client.query(`delete from neon_auth."${name}"`);
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });
  console.log("Emptied. Rebuilding the schema:\n");

  const migrated = spawnSync("npx", ["tsx", "scripts/migrate.ts"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL_UNPOOLED: url, DATABASE_URL: url },
  });
  if (migrated.status !== 0) fail("\nThe migrations did not apply. Staging is empty; fix the cause and run reset again.");
  console.log(`\nStaging is empty. Sign up at https://${STAGING_HOST}, then run: npm run staging -- seed --email <you>`);
}

async function seed(url: string, email: string | undefined): Promise<void> {
  if (!email) fail("Usage: npm run staging -- seed --email you@example.com");
  await requireMarked(url);

  await withPool(url, async (pool) => {
    const { rows: people } = await pool.query<{ id: string; profile: boolean }>(
      `select a.id, exists (select 1 from qr_users u where u.id = a.id) as profile
       from neon_auth."user" a where lower(a.email) = lower($1)`,
      [email]
    );
    const person = people[0];
    if (!person) fail(`No staging account for ${email}. Sign up at https://${STAGING_HOST} first.`);
    if (!person.profile) fail(`${email} has never opened the dashboard. Sign in at https://${STAGING_HOST}/app once.`);

    const { rows: plans } = await pool.query<{ id: string; name: string }>(
      `select id, name from qr_plans where is_active and interval = 'monthly'
       order by max_codes desc, amount_kobo desc limit 1`
    );
    const plan = plans[0];
    if (!plan) fail("No active monthly plan to put the account on.");

    const client = await pool.connect();
    try {
      await client.query("begin");
      // Staff, so the admin can be tried. Better Auth keeps roles as one
      // comma-separated string, and isAdminRole splits it.
      await client.query(`update neon_auth."user" set role = 'admin' where id = $1`, [person.id]);
      // Released, as a confirmed address would be, so its codes serve.
      await client.query("update qr_users set codes_held_since = null where id = $1", [person.id]);

      // The top plan, a year out, with no Paystack behind it: staging takes
      // no payments yet (decided 12 Nov 2026).
      const { rowCount } = await client.query(
        `update qr_subscriptions set plan_id = $2, status = 'active', grace_until = null,
                current_period_end = now() + interval '1 year', updated_at = now()
         where user_id = $1 and status in ('active', 'past_due')`,
        [person.id, plan.id]
      );
      if (!rowCount) {
        await client.query(
          `insert into qr_subscriptions (user_id, plan_id, status, current_period_end)
           values ($1, $2, 'active', now() + interval '1 year')`,
          [person.id, plan.id]
        );
      }

      const made: string[] = [];
      for (const sample of SAMPLE_CODES) {
        // A collision is retried with a fresh code, never checked for first.
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const code = generateCode();
          const { rowCount: inserted } = await client.query(
            `insert into qr_codes (user_id, short_code, name, destination_url, status, blocked_reason)
             values ($1, $2, $3, $4, $5, $6)
             on conflict (short_code) do nothing`,
            [
              person.id,
              code,
              sample.name,
              sample.url,
              sample.status,
              sample.status === "blocked" ? "Blocked by the staging seed, to show the blocked page." : null,
            ]
          );
          if (inserted) {
            made.push(`  https://${STAGING_HOST}/${code}   ${sample.status}`);
            break;
          }
        }
      }
      await client.query("commit");

      console.log(`${email} is now staff, on ${plan.name}, with ${made.length} sample codes:`);
      console.log(made.join("\n"));
      console.log(
        "\nThese are staging links. Artwork downloaded on staging encodes qriateplus.com, which\n" +
          "production will not recognise: test a scan by opening the staging link above."
      );
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });
}

async function main(): Promise<void> {
  const [command] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const emailIndex = process.argv.indexOf("--email");
  const email = emailIndex === -1 ? undefined : process.argv[emailIndex + 1];

  const url = stagingUrl();
  switch (command) {
    case "status":
      return status(url);
    case "mark":
      return mark(url);
    case "reset":
      return reset(url, process.argv.includes("--yes"));
    case "seed":
      return seed(url, email);
    default:
      fail("Usage: npm run staging -- status | mark | reset [--yes] | seed --email <address>");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
