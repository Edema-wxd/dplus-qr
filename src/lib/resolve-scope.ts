import { cache } from "react";
import { auth } from "@/lib/auth/server";
import { queryOne } from "@/lib/db";
import { isMemberRole, scopeFor, type AccountScope } from "@/lib/account-scope";

/**
 * The signed-in person's scope for this request, or null when signed out.
 *
 * Their own account unless `qr_active_accounts` points at a team they are
 * a live member of, and whose owner is still in good standing (not
 * suspended, archived or erased). Anything else falls back to their own
 * account, so a stale choice can only ever send someone home, never into an
 * account they no longer belong to. Read once per request (`cache`).
 */
export const resolveScope = cache(async (): Promise<AccountScope | null> => {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return null;

  const team = await queryOne<{ account_id: string; role: string }>(
    `select a.account_id, m.role
     from qr_active_accounts a
     join qr_account_members m
       on m.account_id = a.account_id and m.user_id = a.user_id and m.removed_at is null
     join qr_users o on o.id = a.account_id
     where a.user_id = $1 and a.account_id <> a.user_id
       and o.suspended_at is null and o.archived_at is null and o.erased_at is null`,
    [user.id]
  );
  if (team && isMemberRole(team.role)) return scopeFor(team.account_id, user.id, team.role);
  return scopeFor(user.id, user.id, "owner");
});
