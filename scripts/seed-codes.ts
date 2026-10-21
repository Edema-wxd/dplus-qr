/**
 * Seed a test account, plan, subscription and a handful of codes, then print
 * the scannable URLs.
 *
 *   npm run seed:codes
 *
 * Covers every redirect decision so the spike can be verified end to end:
 * active, paused, blocked, and a code whose owner's subscription has lapsed
 * past grace.
 *
 * Refuses to run against a production DATABASE_URL.
 */
import { Pool } from "pg";
import QRCode from "qrcode";
import { generateCode } from "../src/lib/short-code";

const BASE_URL = process.env.QR_BASE_URL ?? "http://localhost:3000";

/** Fixed so the seed is idempotent. Not real accounts; see below. */
const SEED_USER_ID = "00000000-0000-4000-8000-000000000001";
const LAPSED_USER_ID = "00000000-0000-4000-8000-000000000002";

const SEEDS = [
  { name: "Active — Google", url: "https://www.google.com", status: "active" },
  { name: "Active — De Sign Plus", url: "https://de-signplus.com", status: "active" },
  { name: "Paused by owner", url: "https://example.com/paused", status: "paused" },
  { name: "Blocked by admin", url: "https://example.com/blocked", status: "blocked" },
] as const;

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. See .env.example.");
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed with NODE_ENV=production.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString });

  try {
    // Plan.
    const { rows: planRows } = await pool.query<{ id: string }>(
      `insert into qr_plans (slug, name, amount_kobo, interval, max_codes, history_days)
       values ('seed-test', 'Seed Test Plan', 0, 'monthly', 100, 30)
       on conflict (slug) do update set name = excluded.name
       returning id`
    );
    const planId = planRows[0].id;

    // Profile rows only. Real accounts live in neon_auth, created by Neon
    // Managed Better Auth -- these two exist so the redirect path can be
    // exercised without signing anyone up, and they cannot be logged into.
    //
    // Fixed uuids rather than generated ones, so re-running the seed updates
    // the same rows instead of accumulating new businesses.
    const { rows: userRows } = await pool.query<{ id: string }>(
      `insert into qr_users (id, email, name)
       values ($1, 'seed@example.test', 'Seed Test Business')
       on conflict (id) do update set name = excluded.name
       returning id`,
      [SEED_USER_ID]
    );
    const userId = userRows[0].id;

    // Active subscription for the main account.
    await pool.query(
      `insert into qr_subscriptions (user_id, plan_id, status, current_period_end)
       values ($1, $2, 'active', now() + interval '30 days')
       on conflict (user_id) where status in ('active','past_due')
       do update set status = 'active', current_period_end = excluded.current_period_end`,
      [userId, planId]
    );

    // A second account whose grace period has already expired, to prove the
    // lapse path without waiting.
    const { rows: lapsedRows } = await pool.query<{ id: string }>(
      `insert into qr_users (id, email, name)
       values ($1, 'lapsed@example.test', 'Lapsed Test Business')
       on conflict (id) do update set name = excluded.name
       returning id`,
      [LAPSED_USER_ID]
    );
    const lapsedUserId = lapsedRows[0].id;

    await pool.query(
      `insert into qr_subscriptions (user_id, plan_id, status, current_period_end, grace_until)
       values ($1, $2, 'past_due', now() - interval '10 days', now() - interval '3 days')
       on conflict (user_id) where status in ('active','past_due')
       do update set status = 'past_due', grace_until = excluded.grace_until`,
      [lapsedUserId, planId]
    );

    // Remove this seed's previous codes so repeated runs do not pile up.
    await pool.query("delete from qr_codes where user_id = any($1::uuid[])", [
      [SEED_USER_ID, LAPSED_USER_ID],
    ]);

    console.log(`\nSeeded codes (base ${BASE_URL}):\n`);

    for (const seed of [
      ...SEEDS.map((s) => ({ ...s, owner: userId })),
      {
        name: "Active, but subscription lapsed",
        url: "https://example.com/lapsed",
        status: "active" as const,
        owner: lapsedUserId,
      },
    ]) {
      const code = await insertWithRetry(pool, seed.owner, seed.name, seed.url, seed.status);
      const url = `${BASE_URL}/${code}`;
      console.log(`  ${seed.status.padEnd(8)} ${seed.name}`);
      console.log(`           ${url}`);
      // Terminal QR, so a phone can scan straight off the screen.
      console.log(await QRCode.toString(url, { type: "terminal", small: true }));
    }
  } finally {
    await pool.end();
  }
}

/**
 * Insert, retrying on a short-code collision. The unique index is the arbiter;
 * checking for existence first would race.
 */
async function insertWithRetry(
  pool: Pool,
  userId: string,
  name: string,
  destination: string,
  status: string,
  attempts = 5
): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    const code = generateCode();
    try {
      await pool.query(
        `insert into qr_codes (user_id, short_code, name, destination_url, status)
         values ($1, $2, $3, $4, $5)`,
        [userId, code, name, destination, status]
      );
      return code;
    } catch (error) {
      const isCollision =
        error instanceof Error && error.message.includes("qr_codes_short_code_key");
      if (!isCollision) throw error;
    }
  }
  throw new Error(`Could not allocate a short code after ${attempts} attempts`);
}

main().catch((error) => {
  console.error("\nSeed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
