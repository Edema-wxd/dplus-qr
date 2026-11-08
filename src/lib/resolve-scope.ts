import { cache } from "react";
import { auth } from "@/lib/auth/server";
import { queryOne } from "@/lib/db";
import { isMemberRole, scopeFor, type AccountScope } from "@/lib/account-scope";
import { MEMBER_USABLE_SQL, PLAN_SEATS_SQL } from "@/lib/seats";

/** Why someone who chose a team is working in their own account instead. */
export type TeamLock = {
  accountId: string;
  ownerName: string;
  /**
   * `lapsed`: no active plan. `no-team`: the plan has no team seats.
   * `seats`: more members than seats, and this one joined later.
   * `unavailable`: the owner's account is suspended, archived or erased,
   * which a member is not told in so many words.
   */
  reason: "lapsed" | "no-team" | "seats" | "unavailable";
};

export type Access = {
  scope: AccountScope;
  /** Set when the person chose a team they cannot use right now. */
  locked: TeamLock | null;
  /** Set when the scope is a team: whose, for "billing is managed by". */
  team: { ownerName: string } | null;
};

/**
 * The signed-in person's scope for this request, and, when they chose a
 * team they cannot use right now, why. Null when signed out.
 *
 * Their own account unless `qr_active_accounts` points at a team they are a
 * live member of and `MEMBER_USABLE_SQL` holds: the owner in good standing,
 * an active plan with a team, and a seat for them by join order. Anything
 * else falls back to their own account, so a stale or locked choice can
 * only ever send someone home, never into an account they cannot use.
 * Locked is not removed: the choice is kept, and they are back in the
 * moment the owner pays, is restored or frees a seat, with no deploy.
 * Read once per request (`cache`).
 */
export const resolveAccess = cache(async (): Promise<Access | null> => {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return null;
  return accessFor(user.id);
});

/**
 * The lookup behind `resolveAccess`, for a user id the caller has already
 * taken from the session. Exported for the database tests; anything serving
 * a request goes through `resolveAccess` or `resolveScope`, which read the
 * session themselves (the scope guard test holds that line).
 */
export async function accessFor(userId: string): Promise<Access> {
  const own = scopeFor(userId, userId, "owner");

  const team = await queryOne<{
    account_id: string;
    role: string;
    owner_name: string;
    usable: boolean;
    standing: boolean;
    active: boolean;
    has_team: boolean;
  }>(
    `select a.account_id, m.role, o.name as owner_name,
            ${MEMBER_USABLE_SQL} as usable,
            (o.suspended_at is null and o.archived_at is null and o.erased_at is null) as standing,
            exists (select 1 from qr_subscriptions s
                    where s.user_id = m.account_id
                      and (s.status = 'active' or (s.status = 'past_due' and s.grace_until > now())))
              as active,
            exists (select 1 from qr_subscriptions s join qr_plans p on p.id = s.plan_id
                    where s.user_id = m.account_id and s.status in ('active', 'past_due')
                      and ${PLAN_SEATS_SQL} > 1)
              as has_team
     from qr_active_accounts a
     join qr_account_members m
       on m.account_id = a.account_id and m.user_id = a.user_id and m.removed_at is null
     join qr_users o on o.id = a.account_id
     where a.user_id = $1 and a.account_id <> a.user_id`,
    [userId]
  );

  if (!team || !isMemberRole(team.role)) return { scope: own, locked: null, team: null };
  if (team.usable) {
    return {
      scope: scopeFor(team.account_id, userId, team.role),
      locked: null,
      team: { ownerName: team.owner_name },
    };
  }

  const reason: TeamLock["reason"] = !team.standing
    ? "unavailable"
    : !team.active
      ? "lapsed"
      : !team.has_team
        ? "no-team"
        : "seats";
  return { scope: own, locked: { accountId: team.account_id, ownerName: team.owner_name, reason }, team: null };
}

/** The scope alone, for the many callers that need nothing else. */
export const resolveScope = cache(async (): Promise<AccountScope | null> => {
  return (await resolveAccess())?.scope ?? null;
});
