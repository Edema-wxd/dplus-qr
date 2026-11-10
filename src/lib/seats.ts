import type { AccountScope } from "@/lib/account-scope";
import type { PlanFeatures } from "@/lib/plans";

/**
 * Team seats: how many people a plan allows, how many an account is using,
 * and who keeps access when the two disagree.
 *
 * A seat is a person, **the owner included** (decided 7 Nov 2026: Business
 * is "5 people", the owner plus four). A pending invite holds a seat until
 * it is accepted, revoked or expires, so an owner cannot send ten invites
 * for four places. Pure, apart from the SQL fragment that counts, so every
 * rule here is tested without a database.
 */

/**
 * People the plan allows, owner included: `features.team_seats` when it is a
 * positive whole number, else 1 (the owner alone, no team). Anything else
 * stored there, such as the `true` migration 013 wrote before 028 turned it
 * into a count, reads as no team rather than as a guess.
 */
export function planSeats(features: PlanFeatures | null | undefined): number {
  const value = features?.team_seats;
  return typeof value === "number" && Number.isInteger(value) && value >= 2 ? value : 1;
}

/** Whether the plan has a team at all. */
export function hasTeam(features: PlanFeatures | null | undefined): boolean {
  return planSeats(features) > 1;
}

/**
 * Seats an account is using, for a statement whose `$n` is the account id:
 * the owner, live members, and invites still waiting for an answer. One
 * fragment, so the entitlement, checkout and staff assignment count alike.
 */
export function seatsHeldSql(n: number): string {
  return `(1
    + (select count(*) from qr_account_members m
        where m.account_id = $${n}::uuid and m.removed_at is null)
    + (select count(*) from qr_account_invites i
        where i.account_id = $${n}::uuid and i.accepted_at is null
          and i.revoked_at is null and i.expires_at > now()))`;
}

/**
 * Why a plan cannot hold this many people, or null when it can. Shared by
 * checkout and staff assignment: a downgrade never removes anyone, as it
 * never removes a code; the owner removes members first.
 */
export function seatRefusal(planName: string, features: PlanFeatures | null | undefined, seatsHeld: number): string | null {
  const allowed = planSeats(features);
  if (seatsHeld <= allowed) return null;
  const others = seatsHeld - 1;
  const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
  if (allowed === 1) {
    return `Your team has ${people(others)} besides you, and the ${planName} plan has no team. Remove ${others === 1 ? "them" : "them all"} or cancel pending invites first.`;
  }
  const over = seatsHeld - allowed;
  return `Your team has ${people(seatsHeld)}, counting you and pending invites, and the ${planName} plan covers ${people(allowed)}. Remove ${people(over)} first.`;
}

/** A member as seat order sees them. */
export type SeatMember = { userId: string; joinedAt: Date };

/**
 * Who keeps access when a plan has fewer seats than members, as when staff
 * lower `team_seats` or move the account to a plan without a team (decided
 * 7 Nov 2026): the owner always, then members in the order they joined, up
 * to the plan's seats. The rest are locked, not removed, so when the owner
 * removes someone or upgrades, access comes back without anyone re-joining.
 * Pending invites do not count here: they hold a seat against new invites,
 * never against people already in.
 */
export function seatState(members: SeatMember[], seats: number): { active: string[]; locked: string[] } {
  const places = Math.max(0, seats - 1);
  const ordered = [...members].sort(
    (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime() || a.userId.localeCompare(b.userId)
  );
  return {
    active: ordered.slice(0, places).map((m) => m.userId),
    locked: ordered.slice(places).map((m) => m.userId),
  };
}

/** What `canInvite` needs to know about the account. */
export type SeatEntitlement = { planName: string; active: boolean; seats: number; seatsUsed: number };

/**
 * Whether this person may invite someone into the account now. Only the
 * owner invites (admins are allowed by the schema but not offered yet), on
 * a plan that is active and has a team, with a seat free.
 */
export function canInvite(
  entitlement: SeatEntitlement | null,
  scope: AccountScope
): { ok: true } | { ok: false; reason: string } {
  if (scope.role !== "owner") return { ok: false, reason: "Only the account owner can invite people." };
  if (!entitlement || !entitlement.active) {
    return { ok: false, reason: "This account's plan is not active, so no one can be invited." };
  }
  if (entitlement.seats <= 1) {
    return { ok: false, reason: `Team seats are not part of the ${entitlement.planName} plan.` };
  }
  if (entitlement.seatsUsed >= entitlement.seats) {
    return {
      ok: false,
      reason: `All ${entitlement.seats} seats on the ${entitlement.planName} plan are taken, counting you and pending invites. Remove someone or cancel an invite first.`,
    };
  }
  return { ok: true };
}

/**
 * People a plan allows, in SQL, for a `qr_plans` row aliased `p`: the same
 * rule as `planSeats`. A whole number of 2 or more, capped in length so a
 * stray value cannot overflow the cast; anything else is 1, no team.
 */
export const PLAN_SEATS_SQL = `(case
    when (p.features->>'team_seats') ~ '^[0-9]{1,6}$' and (p.features->>'team_seats')::int >= 2
    then (p.features->>'team_seats')::int
    else 1 end)`;

/**
 * Whether a live member can use the team right now, for a member row
 * aliased `m` and its owner's `qr_users` row aliased `o`. All of:
 *
 * - the owner is not suspended, archived or erased;
 * - the account has an active plan (or one in its grace period) that
 *   includes a team;
 * - the member is within the plan's seats, counting the owner first and then
 *   members in the order they joined (`seatState`, decided 7 Nov 2026).
 *
 * One fragment, so `resolveScope` and the switcher agree on who is in. A
 * member who fails it keeps their membership; they are locked, not removed,
 * and back in the moment the owner pays, is restored, or frees a seat.
 */
export const MEMBER_USABLE_SQL = `(o.suspended_at is null and o.archived_at is null and o.erased_at is null
    and exists (
      select 1 from qr_subscriptions s join qr_plans p on p.id = s.plan_id
      where s.user_id = m.account_id
        and (s.status = 'active' or (s.status = 'past_due' and s.grace_until > now()))
        and (select count(*) from qr_account_members e
             where e.account_id = m.account_id and e.removed_at is null
               and (e.joined_at, e.user_id) < (m.joined_at, m.user_id))
            < ${PLAN_SEATS_SQL} - 1))`;
