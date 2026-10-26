import { query, queryOne } from "@/lib/db";

/**
 * Who is staff, and the record of what staff looked at.
 *
 * Staff are accounts whose Neon Auth `role` includes `admin`. The role lives in
 * `neon_auth."user"`, the managed service's own table, and is read from there
 * on every check rather than from the session cookie: a role taken away must
 * stop working at the next request, not when a cached session expires.
 *
 * Granting it is deliberately outside the app, so no screen can make someone
 * an admin:
 *
 *   update neon_auth."user" set role = 'admin' where email = '...';
 */

/**
 * Better Auth stores roles as one comma-separated string (`"user,admin"`), so
 * this splits rather than comparing for equality.
 */
export function isAdminRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return role
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .includes("admin");
}

/** True only for an admin account that has not been banned. */
export async function isAdmin(userId: string): Promise<boolean> {
  const row = await queryOne<{ role: string | null; banned: boolean | null }>(
    `select role, banned from neon_auth."user" where id = $1`,
    [userId]
  );
  return row !== null && row.banned !== true && isAdminRole(row.role);
}

export type AdminAuditEntry = {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  detail?: Record<string, unknown>;
};

/**
 * One row in `qr_admin_audit`, which the compliance pages promise exists.
 * Viewing a customer's account is recorded as well as changing one: under the
 * NDPA, who looked at personal data is part of what an audit has to answer.
 */
export async function recordAdminAudit(entry: AdminAuditEntry): Promise<void> {
  await query(
    `insert into qr_admin_audit (actor_id, action, target_type, target_id, detail)
     values ($1, $2, $3, $4, $5)`,
    [
      entry.actorId,
      entry.action,
      entry.targetType,
      entry.targetId ?? null,
      JSON.stringify(entry.detail ?? {}),
    ]
  );
}
