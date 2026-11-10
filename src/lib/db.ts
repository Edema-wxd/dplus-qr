import { Pool, type PoolClient } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { required } from "@/lib/env";
import { pinSslMode } from "@/lib/db-url";

declare global {
  var _qrPool: Pool | undefined;
}

/**
 * Postgres pool.
 *
 * `pg` rather than `@neondatabase/serverless` on Neon's own advice for Vercel:
 * with Fluid compute the process is long-lived, so a real pool is reused across
 * requests, and `attachDatabasePool` lets Vercel drain it before the instance
 * is frozen or shut down. It is also the portable choice -- the same driver
 * works unchanged on a Node server or a VPS, which keeps decision 3 open.
 *
 * This is the POOLED connection (PgBouncer, `-pooler` host). Migrations and
 * anything needing session state use the direct URL instead -- see
 * scripts/migrate.ts.
 */
export function db(): Pool {
  if (global._qrPool) return global._qrPool;

  const pool = new Pool({
    connectionString: pinSslMode(required("DATABASE_URL")),
    // The redirect path must fail fast rather than hang: a scanner waiting on a
    // connection is worse than a status page.
    connectionTimeoutMillis: 5_000,
    // Neon scales to zero, so idle connections are dropped server-side anyway.
    idleTimeoutMillis: 30_000,
    max: 10,
  });

  pool.on("error", (error) => {
    // An idle client erroring must never take the process down.
    console.error("[db] idle client error", error);
  });

  // No-op off Vercel, so this stays safe on any host.
  attachDatabasePool(pool);

  global._qrPool = pool;
  return pool;
}

export type QueryOptions = {
  /**
   * Give up on the first failed connection instead of trying once more. Only
   * the redirect asks for this: a scanner should get the status page after
   * one wait, never two.
   */
  failFast?: boolean;
};

/**
 * A client from the pool, with one more try if connecting fails.
 *
 * Neon pauses the database when nobody has used it for a while, and the first
 * connection after that waits while it wakes. Twice, in the small hours, that
 * took longer than the 5-second limit above: the pricing page fell back to
 * its default copy and the nightly grace job missed its run. By the time the
 * first attempt gives up, the database has usually woken, so a second
 * attempt connects at once.
 *
 * Only connecting is retried, never a query: a failed connection means no
 * statement reached the database, so trying again cannot run anything twice.
 */
async function connect(options: QueryOptions = {}): Promise<PoolClient> {
  try {
    return await db().connect();
  } catch (error) {
    if (options.failFast) throw error;
    console.warn("[db] could not connect; trying once more", {
      message: error instanceof Error ? error.message : String(error),
    });
    return db().connect();
  }
}

export async function query<T extends Record<string, unknown>>(
  text: string,
  params: readonly unknown[] = [],
  options: QueryOptions = {}
): Promise<T[]> {
  const client = await connect(options);
  try {
    const result = await client.query(text, params as unknown[]);
    client.release();
    return result.rows as T[];
  } catch (error) {
    // Handing the error back makes the pool discard the client, as
    // `pool.query()` does, so a connection that broke is not reused.
    client.release(error instanceof Error ? error : true);
    throw error;
  }
}

export async function queryOne<T extends Record<string, unknown>>(
  text: string,
  params: readonly unknown[] = [],
  options: QueryOptions = {}
): Promise<T | null> {
  const rows = await query<T>(text, params, options);
  return rows[0] ?? null;
}

/**
 * Run several statements on one connection inside a transaction.
 *
 * Needed by the Paystack webhook, where marking an event processed and moving
 * the subscription it describes have to land together: a crash between the two
 * would otherwise leave an event logged as handled whose effect never happened,
 * and Paystack will not send it again.
 *
 * Takes a client out of the pool rather than using `query()`, because each
 * `query()` call may get a different pooled connection and `BEGIN` on one
 * connection does not wrap work done on another. This is safe over PgBouncer
 * in transaction mode -- a transaction holds its server connection for its
 * whole life. It is the *session* state that pooling breaks, which is why
 * migrations use the direct URL instead.
 */
export async function withTransaction<T>(
  run: (run: <R extends Record<string, unknown>>(
    text: string,
    params?: readonly unknown[]
  ) => Promise<R[]>) => Promise<T>
): Promise<T> {
  const client = await connect();
  try {
    await client.query("begin");
    const result = await run(async <R extends Record<string, unknown>>(
      text: string,
      params: readonly unknown[] = []
    ) => {
      const r = await client.query(text, params as unknown[]);
      return r.rows as R[];
    });
    await client.query("commit");
    return result;
  } catch (error) {
    // A rollback that itself fails must not mask the original error.
    await client.query("rollback").catch((rollbackError) => {
      console.error("[db] rollback failed", rollbackError);
    });
    throw error;
  } finally {
    client.release();
  }
}
