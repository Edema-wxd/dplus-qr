import { query, queryOne } from "@/lib/db";

export { sessionIdOf } from "@/lib/session-cookie";

/**
 * Sessions as the database holds them, so that signing out ends every one of
 * them at once.
 *
 * Neon Auth keeps each session as a row in `neon_auth.session`, in this same
 * database. It also gives each device a signed copy of its session
 * (`session_data`) that the SDK trusts for up to five minutes without asking
 * anyone. Deleting the rows alone would therefore leave every other device
 * signed in until its copy ran out. So the app asks the table too: a session
 * whose row is gone is a session that has ended, however fresh the copy the
 * device holds (`getSession` in `auth/server.ts`, and the staff check in
 * `proxy.ts`).
 *
 * `neon_auth` belongs to the managed service, which may reshape it; that is
 * why there is no foreign key into it (DECISIONS.md). These two statements
 * name only `id`, `userId` and `expiresAt`, the columns Better Auth's session
 * model is built on. If they ever stop matching, the read fails and
 * `getSession` falls back to the SDK's own answer, so the site keeps working
 * and only the instant part of sign-out is lost.
 */

/** Whether this session still has its row and has not expired. */
export async function sessionIsLive(sessionId: string): Promise<boolean> {
  const row = await queryOne<{ live: boolean }>(
    `select exists (
       select 1 from neon_auth.session where id = $1 and "expiresAt" > now()
     ) as live`,
    [sessionId]
  );
  return row?.live === true;
}

/**
 * End every session this person has, on every device, in one statement.
 * Returns how many there were.
 */
export async function endAllSessions(userId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    `delete from neon_auth.session where "userId" = $1 returning id`,
    [userId]
  );
  return rows.length;
}
