import "server-only";
import {
  createRealtime,
  pgParam,
  rawSql,
  type RawSqlParameter,
  type RawSqlQuery,
  type RealtimeServer,
  type SealedLiveQuery,
} from "@neon/realtime/server";
import { env, required } from "@/lib/env";
import {
  codesQuery,
  getCodeRow,
  listCodeRows,
  utcDay,
  type CodeRow,
  type UtcDay,
} from "@/lib/user-codes";

/**
 * Live dashboard queries, through Neon Realtime.
 *
 * The dashboard renders from `pg` as it always has, then subscribes to the
 * very same SQL so a scan, a pause or an admin block shows up without a
 * reload. Realtime reads committed changes from the database's replication
 * stream, so it adds nothing to the redirect path: a scan is recorded exactly
 * as before and this module is never in that route's module graph
 * (`src/__tests__/redirect-isolation.test.ts`).
 *
 * **Live is an enhancement, never a dependency.** Without the two env vars, or
 * if sealing throws, the page renders its server rows and simply is not live.
 *
 * **A sealed query is a bearer token** for one user's rows for about a minute.
 * It travels in the page payload and the renewal response only -- never a
 * URL, a log line or browser storage. `NEON_REALTIME_SECRET` seals any query
 * at all, which is why this file is `server-only`.
 */

let server: RealtimeServer<RawSqlQuery<unknown>> | undefined;

/**
 * Built on first use, not at module scope, so `next build` needs no secret.
 * See "The build must need no secrets" in CLAUDE.md.
 */
function realtime(): RealtimeServer<RawSqlQuery<unknown>> {
  server ??= createRealtime({
    secret: required("NEON_REALTIME_SECRET"),
    db: databaseName(),
  });
  return server;
}

/** The database a sealed query is bound to: the `dbname` in DATABASE_URL. */
function databaseName(): string {
  return decodeURIComponent(new URL(required("DATABASE_URL")).pathname.slice(1));
}

export function realtimeUrl(): string | null {
  const { NEON_REALTIME_URL, NEON_REALTIME_SECRET } = env();
  return NEON_REALTIME_URL && NEON_REALTIME_SECRET ? NEON_REALTIME_URL : null;
}

/**
 * Seal the codes query for one user and one UTC day, optionally narrowed to a
 * single code.
 *
 * Built from `codesQuery()`, the function the server render runs, so the live
 * rows and the initial rows are one query and one shape. The user id is always
 * the session's; the query filters by it, so an `id` belonging to someone else
 * matches nothing rather than leaking a row.
 */
export function sealCodes(
  userId: string,
  day: UtcDay,
  id?: string
): Promise<SealedLiveQuery<CodeRow>> {
  const { text, windows } = codesQuery(userId, day, id);
  const params: RawSqlParameter[] = [
    userId,
    pgParam.timestamptz(windows.today),
    pgParam.timestamptz(windows.since7d),
    pgParam.timestamptz(windows.since30d),
  ];
  if (id !== undefined) params.push(id);
  return realtime().seal({ query: rawSql<CodeRow>(text, params) });
}

/** Everything a page hands its live table, or `null` when it is not live. */
export type LiveCodes = {
  url: string;
  day: UtcDay;
  sealedQuery: SealedLiveQuery<CodeRow>;
};

async function sealOrNull(
  userId: string,
  day: UtcDay,
  id?: string
): Promise<LiveCodes | null> {
  const url = realtimeUrl();
  if (!url) return null;
  try {
    return { url, day, sealedQuery: await sealCodes(userId, day, id) };
  } catch (error) {
    // Never the sealed query or its parameters: it is a bearer token.
    console.error(
      "[realtime] seal failed",
      error instanceof Error ? error.message : "unknown error"
    );
    return null;
  }
}

/** The list page: server rows and, when available, the live subscription. */
export async function loadCodeList(
  userId: string
): Promise<{ rows: CodeRow[]; live: LiveCodes | null }> {
  const day = utcDay();
  const [rows, live] = await Promise.all([
    listCodeRows(userId, day),
    sealOrNull(userId, day),
  ]);
  return { rows, live };
}

/** One code's page. `row` is null when the code is not this user's. */
export async function loadCode(
  userId: string,
  id: string
): Promise<{ row: CodeRow | null; live: LiveCodes | null }> {
  const day = utcDay();
  const [row, live] = await Promise.all([
    getCodeRow(userId, id, day),
    sealOrNull(userId, day, id),
  ]);
  return { row, live };
}
