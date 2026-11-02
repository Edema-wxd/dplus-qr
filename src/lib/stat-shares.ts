import { randomBytes } from "node:crypto";
import { query, queryOne } from "@/lib/db";

/**
 * Public, read-only stats links for a code (`/s/{token}`).
 *
 * The token is the only credential, so it is 32 characters of base64url from
 * 24 random bytes: not guessable, not enumerable. A shared page shows a code's
 * name, short link and scan statistics, and never its destination, which the
 * owner may not want public.
 *
 * Owner-side calls filter by `user_id` like everything in `user-codes.ts`.
 * The public read (`loadSharedCode`) takes only the token and refuses, in the
 * same query, anything moderation has taken down: a blocked or archived code,
 * or a suspended, archived or erased owner.
 */

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export function isShareToken(raw: string): boolean {
  return TOKEN_PATTERN.test(raw);
}

export function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}

export type LiveShare = { token: string; createdAt: Date };

export async function getLiveShare(userId: string, codeId: string): Promise<LiveShare | null> {
  const row = await queryOne<{ token: string; created_at: Date }>(
    `select token, created_at from qr_stat_shares
     where user_id = $1 and qr_id = $2 and revoked_at is null`,
    [userId, codeId]
  );
  return row ? { token: row.token, createdAt: row.created_at } : null;
}

export async function revokeShare(userId: string, codeId: string): Promise<void> {
  await query(
    `update qr_stat_shares set revoked_at = now()
     where user_id = $1 and qr_id = $2 and revoked_at is null`,
    [userId, codeId]
  );
}

/**
 * Issue a fresh link for a code the account owns, revoking any live one.
 *
 * Two statements, not one: the partial unique index is what makes "one live
 * link" true, and a double click that races here meets it as a violation,
 * which is answered with whichever link won. Null when the code is not this
 * account's.
 */
export async function createShare(userId: string, codeId: string): Promise<LiveShare | null> {
  await revokeShare(userId, codeId);
  try {
    const row = await queryOne<{ token: string; created_at: Date }>(
      `insert into qr_stat_shares (qr_id, user_id, token)
       select c.id, c.user_id, $3 from qr_codes c
       where c.user_id = $1 and c.id = $2
       returning token, created_at`,
      [userId, codeId, newShareToken()]
    );
    return row ? { token: row.token, createdAt: row.created_at } : null;
  } catch (error) {
    if (error instanceof Error && error.message.includes("qr_stat_shares_live_idx")) {
      return getLiveShare(userId, codeId);
    }
    throw error;
  }
}

export type SharedCode = {
  userId: string;
  codeId: string;
  name: string;
  shortCode: string;
  ownerName: string;
  createdAt: Date;
};

/** The code behind a live share link, or null for anything not to be shown. */
export async function loadSharedCode(token: string): Promise<SharedCode | null> {
  if (!isShareToken(token)) return null;
  const row = await queryOne<{
    user_id: string;
    id: string;
    name: string;
    short_code: string;
    owner_name: string;
    created_at: Date;
  }>(
    `select c.user_id, c.id, c.name, c.short_code, u.name as owner_name, c.created_at
     from qr_stat_shares s
     join qr_codes c on c.id = s.qr_id and c.user_id = s.user_id
     join qr_users u on u.id = c.user_id
     where s.token = $1
       and s.revoked_at is null
       and c.status <> 'blocked'
       and c.archived_at is null
       and u.suspended_at is null
       and u.archived_at is null
       and u.erased_at is null`,
    [token]
  );
  if (!row) return null;
  return {
    userId: row.user_id,
    codeId: String(row.id),
    name: row.name,
    shortCode: row.short_code,
    ownerName: row.owner_name,
    createdAt: row.created_at,
  };
}
