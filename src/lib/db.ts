import { Pool } from "@neondatabase/serverless";
import { env } from "@/lib/env";

declare global {
  var _qrPool: Pool | undefined;
}

/**
 * Neon pool. Reused across hot reloads in development so a long dev session
 * does not exhaust connections.
 */
export function db(): Pool {
  if (global._qrPool) return global._qrPool;

  const pool = new Pool({ connectionString: env().DATABASE_URL });

  if (env().NODE_ENV !== "production") {
    global._qrPool = pool;
  }
  return pool;
}

export async function query<T extends Record<string, unknown>>(
  text: string,
  params: readonly unknown[] = []
): Promise<T[]> {
  const result = await db().query(text, params as unknown[]);
  return result.rows as T[];
}

export async function queryOne<T extends Record<string, unknown>>(
  text: string,
  params: readonly unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
