import { cache } from "react";
import { query, queryOne, withTransaction } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import type { AccountScope } from "@/lib/account-scope";
import { canInvite, MEMBER_USABLE_SQL, planSeats, seatState, seatsHeldSql } from "@/lib/seats";
import {
  hashInviteToken,
  INVITE_DAYS,
  inviteEmail,
  invitePath,
  isInviteToken,
  newInviteToken,
  teamSeatsLive,
  type InviteRole,
} from "@/lib/team-invite";

/**
 * Teams: inviting people into an account, accepting, changing roles,
 * removing, leaving, and switching between accounts.
 *
 * Identity is Neon Auth's; membership is ours (`qr_account_members`), so
 * the managed service's organization plugin stays off and seat limits are
 * enforced here, from the plan rows.
 *
 * **Every change that uses a seat runs under a lock on the account's
 * `qr_users` row** (`select ... for update`), so two invites, or two people
 * accepting at once, cannot both take the last seat. A plain read of that
 * row, which is all the redirect does, is not blocked by it.
 *
 * Only the owner manages the team (decided 7 Nov 2026: owner, editor and
 * viewer; admin is allowed by the schema but not offered). The team log
 * (`qr_account_events`) records ids and roles, never an email address.
 */

type Tx = <R extends Record<string, unknown>>(text: string, params?: readonly unknown[]) => Promise<R[]>;

export type TeamResult<T = object> = ({ ok: true } & T) | { ok: false; reason: string };

const NOT_LIVE = "Teams are not available yet.";

/** The account's row, locked, with what the seat and standing checks need. */
async function lockAccount(run: Tx, accountId: string) {
  const rows = await run<{
    name: string;
    email: string;
    good_standing: boolean;
    plan_name: string | null;
    features: Record<string, unknown> | null;
    active: boolean | null;
    seats_used: string;
  }>(
    `select u.name, u.email,
            (u.suspended_at is null and u.archived_at is null and u.erased_at is null) as good_standing,
            p.name as plan_name, p.features,
            (s.status = 'active' or (s.status = 'past_due' and s.grace_until > now())) as active,
            ${seatsHeldSql(1)} as seats_used
     from qr_users u
     left join qr_subscriptions s on s.user_id = u.id and s.status in ('active', 'past_due')
     left join qr_plans p on p.id = s.plan_id
     where u.id = $1
     for update of u`,
    [accountId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    name: row.name,
    email: row.email.toLowerCase(),
    goodStanding: row.good_standing,
    planName: row.plan_name ?? "current",
    active: row.active === true,
    seats: planSeats(row.features),
    seatsUsed: Number(row.seats_used),
  };
}

async function logEvent(
  run: Tx,
  event: { accountId: string; actorId: string | null; subjectId?: string | null; action: string; detail?: Record<string, unknown> }
): Promise<void> {
  await run(
    `insert into qr_account_events (account_id, actor_id, subject_id, action, detail)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [event.accountId, event.actorId, event.subjectId ?? null, event.action, JSON.stringify(event.detail ?? {})]
  );
}

class Refused extends Error {}

async function inTeamTransaction<T>(work: (run: Tx) => Promise<T>): Promise<T | { ok: false; reason: string }> {
  try {
    return await withTransaction(work);
  } catch (error) {
    if (error instanceof Refused) return { ok: false, reason: error.message };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Invites.
// ---------------------------------------------------------------------------

/**
 * Invite someone by email, then send the email.
 *
 * The invite is written under the account lock, with every refusal checked
 * there: the owner's own address, someone already in the team, an invite
 * already waiting for that address, and no free seat. The email goes out
 * after the commit. If it cannot be sent the invite is revoked straight
 * away and the owner told, so a failed send never leaves an invite holding
 * a seat that nobody was told about.
 *
 * The reply says nothing about whether the address already has an account.
 */
export async function createInvite(
  scope: AccountScope,
  input: { email: string; role: InviteRole }
): Promise<TeamResult<{ email: string }>> {
  if (!teamSeatsLive()) return { ok: false, reason: NOT_LIVE };
  if (scope.role !== "owner") return { ok: false, reason: "Only the account owner can invite people." };

  const token = newInviteToken();
  const created = await inTeamTransaction(async (run) => {
    const account = await lockAccount(run, scope.accountId);
    if (!account) throw new Refused("We could not find your account.");
    const allowed = canInvite(
      { planName: account.planName, active: account.active, seats: account.seats, seatsUsed: account.seatsUsed },
      scope
    );
    if (!allowed.ok) throw new Refused(allowed.reason);
    if (input.email === account.email) throw new Refused("That is your own address. You are already the owner.");

    const member = await run<{ id: string }>(
      `select m.id from qr_account_members m join qr_users u on u.id = m.user_id
       where m.account_id = $1 and m.removed_at is null and lower(u.email) = $2`,
      [scope.accountId, input.email]
    );
    if (member[0]) throw new Refused("That person is already in your team.");

    const pending = await run<{ id: string }>(
      `select id from qr_account_invites
       where account_id = $1 and email = $2 and accepted_at is null and revoked_at is null`,
      [scope.accountId, input.email]
    );
    if (pending[0]) {
      throw new Refused("That address already has an invite waiting. Cancel it to send a new one.");
    }

    const rows = await run<{ id: string; expires_at: Date }>(
      `insert into qr_account_invites (account_id, email, role, token_hash, invited_by, expires_at)
       values ($1, $2, $3, $4, $5, now() + make_interval(days => $6))
       returning id, expires_at`,
      [scope.accountId, input.email, input.role, hashInviteToken(token), scope.actorId, INVITE_DAYS]
    );
    await logEvent(run, {
      accountId: scope.accountId,
      actorId: scope.actorId,
      action: "invite.create",
      detail: { inviteId: String(rows[0].id), role: input.role },
    });
    return { ok: true as const, inviteId: String(rows[0].id), expiresAt: rows[0].expires_at, accountName: account.name };
  });
  if (!created.ok) return created;

  const message = inviteEmail({
    accountName: created.accountName,
    role: input.role,
    link: `${env().QR_BASE_URL}${invitePath(token)}`,
    expiresAt: created.expiresAt,
  });
  const sent = await sendEmail({ group: "onboarding", to: input.email, ...message });
  if (!sent) {
    await withTransaction(async (run) => {
      await run(
        `update qr_account_invites set revoked_at = now()
         where id = $1 and account_id = $2 and accepted_at is null and revoked_at is null`,
        [created.inviteId, scope.accountId]
      );
      await logEvent(run, {
        accountId: scope.accountId,
        actorId: scope.actorId,
        action: "invite.unsent",
        detail: { inviteId: created.inviteId },
      });
    });
    return { ok: false, reason: "We could not send that invitation, so it was not kept. Please try again in a moment." };
  }
  return { ok: true, email: input.email };
}

/** Withdraw an invite that has not been accepted. The owner's alone. */
export async function revokeInvite(scope: AccountScope, inviteId: string): Promise<TeamResult> {
  if (scope.role !== "owner") return { ok: false, reason: "Only the account owner can cancel invites." };
  return inTeamTransaction(async (run) => {
    const rows = await run<{ id: string }>(
      `update qr_account_invites set revoked_at = now()
       where id = $1 and account_id = $2 and accepted_at is null and revoked_at is null
       returning id`,
      [inviteId, scope.accountId]
    );
    if (!rows[0]) throw new Refused("That invite has already been used or cancelled.");
    await logEvent(run, { accountId: scope.accountId, actorId: scope.actorId, action: "invite.revoke", detail: { inviteId } });
    return { ok: true as const };
  });
}

export type InviteView = {
  accountId: string;
  accountName: string;
  email: string;
  role: InviteRole;
  expiresAt: Date;
  /** Only `live` can be accepted; the rest explain themselves on the page. */
  state: "live" | "expired" | "used" | "revoked" | "unavailable";
};

/**
 * What the invite page shows for a token, or null for a token that matches
 * nothing (answered as the ordinary not-found page). Looked up by hash; a
 * malformed token never reaches the database. Read once per request: the
 * page and its title both ask.
 */
export const inviteByToken = cache(async (token: string): Promise<InviteView | null> => {
  if (!teamSeatsLive() || !isInviteToken(token)) return null;
  const row = await queryOne<{
    account_id: string;
    account_name: string;
    email: string;
    role: InviteRole;
    expires_at: Date;
    accepted: boolean;
    revoked: boolean;
    expired: boolean;
    good_standing: boolean;
  }>(
    `select i.account_id, u.name as account_name, i.email, i.role, i.expires_at,
            i.accepted_at is not null as accepted, i.revoked_at is not null as revoked,
            i.expires_at <= now() as expired,
            (u.suspended_at is null and u.archived_at is null and u.erased_at is null) as good_standing
     from qr_account_invites i join qr_users u on u.id = i.account_id
     where i.token_hash = $1`,
    [hashInviteToken(token)]
  );
  if (!row) return null;
  return {
    accountId: row.account_id,
    accountName: row.account_name,
    email: row.email,
    role: row.role,
    expiresAt: row.expires_at,
    state: row.accepted
      ? "used"
      : row.revoked
        ? "revoked"
        : row.expired
          ? "expired"
          : !row.good_standing
            ? "unavailable"
            : "live",
  };
});

/**
 * Join a team. The signed-in person must have verified their address, and
 * it must be the one invited (decided 7 Nov 2026), so a forwarded email
 * cannot be accepted by whoever it was forwarded to.
 *
 * Under the account lock: the invite is still live, the account is in good
 * standing on an active plan with a team, and the seats still fit. The
 * pending invite already holds its seat, so accepting it moves a seat from
 * invites to members rather than taking a new one. The new member's
 * dashboard opens on the team.
 */
export async function acceptInvite(
  user: { id: string; email: string; emailVerified: boolean },
  token: string
): Promise<TeamResult<{ accountId: string; accountName: string }>> {
  if (!teamSeatsLive() || !isInviteToken(token)) return { ok: false, reason: "That invitation could not be found." };
  if (!user.emailVerified) {
    return { ok: false, reason: "Verify your email address first, then open the invitation again." };
  }

  const hash = hashInviteToken(token);
  const found = await queryOne<{ account_id: string }>(
    `select account_id from qr_account_invites where token_hash = $1`,
    [hash]
  );
  if (!found) return { ok: false, reason: "That invitation could not be found." };

  return inTeamTransaction(async (run) => {
    // The account first, then the invite: the same order `createInvite`
    // takes its lock in, so the two never wait on each other.
    const account = await lockAccount(run, found.account_id);
    const invites = await run<{ id: string; email: string; role: InviteRole; live: boolean }>(
      `select id, email, role,
              (accepted_at is null and revoked_at is null and expires_at > now()) as live
       from qr_account_invites where token_hash = $1
       for update`,
      [hash]
    );
    const invite = invites[0];
    if (!account || !invite) throw new Refused("That invitation could not be found.");
    if (!invite.live) throw new Refused("That invitation has expired or has already been used. Ask for a new one.");
    if (user.email.toLowerCase() !== invite.email) {
      throw new Refused("This invitation was sent to a different email address. Sign in with that address to accept it.");
    }
    if (user.id === found.account_id) throw new Refused("This is your own account.");
    if (!account.goodStanding || !account.active || account.seats <= 1) {
      throw new Refused("This team is not taking new members right now. Ask the person who invited you.");
    }
    if (account.seatsUsed > account.seats) {
      throw new Refused("This team has no free seats. Ask the person who invited you.");
    }

    const already = await run<{ id: string }>(
      `select id from qr_account_members where account_id = $1 and user_id = $2 and removed_at is null`,
      [found.account_id, user.id]
    );
    if (already[0]) throw new Refused("You are already in this team.");

    await run(
      `insert into qr_account_members (account_id, user_id, role, invited_by)
       select $1, $2, i.role, i.invited_by from qr_account_invites i where i.id = $3`,
      [found.account_id, user.id, invite.id]
    );
    await run(`update qr_account_invites set accepted_at = now(), accepted_by = $2 where id = $1`, [invite.id, user.id]);
    await logEvent(run, {
      accountId: found.account_id,
      actorId: user.id,
      subjectId: user.id,
      action: "invite.accept",
      detail: { inviteId: String(invite.id), role: invite.role },
    });
    await run(
      `insert into qr_active_accounts (user_id, account_id) values ($1, $2)
       on conflict (user_id) do update set account_id = excluded.account_id, updated_at = now()`,
      [user.id, found.account_id]
    );
    return { ok: true as const, accountId: found.account_id, accountName: account.name };
  });
}

// ---------------------------------------------------------------------------
// Members.
// ---------------------------------------------------------------------------

/** Take someone out of the team. Their account and anything they made stay. */
export async function removeMember(scope: AccountScope, memberId: string): Promise<TeamResult> {
  if (scope.role !== "owner") return { ok: false, reason: "Only the account owner can remove people." };
  return inTeamTransaction(async (run) => {
    const rows = await run<{ role: string }>(
      `update qr_account_members set removed_at = now(), removed_by = $3
       where account_id = $1 and user_id = $2 and removed_at is null
       returning role`,
      [scope.accountId, memberId, scope.actorId]
    );
    if (!rows[0]) throw new Refused("That person is no longer in the team.");
    await logEvent(run, {
      accountId: scope.accountId,
      actorId: scope.actorId,
      subjectId: memberId,
      action: "member.remove",
      detail: { role: rows[0].role },
    });
    return { ok: true as const };
  });
}

export async function changeRole(scope: AccountScope, memberId: string, role: InviteRole): Promise<TeamResult> {
  if (scope.role !== "owner") return { ok: false, reason: "Only the account owner can change roles." };
  return inTeamTransaction(async (run) => {
    const rows = await run<{ previous: string }>(
      `update qr_account_members m set role = $3
       from (select id, role as previous from qr_account_members
             where account_id = $1 and user_id = $2 and removed_at is null) old
       where m.id = old.id
       returning old.previous`,
      [scope.accountId, memberId, role]
    );
    if (!rows[0]) throw new Refused("That person is no longer in the team.");
    if (rows[0].previous !== role) {
      await logEvent(run, {
        accountId: scope.accountId,
        actorId: scope.actorId,
        subjectId: memberId,
        action: "member.role",
        detail: { from: rows[0].previous, to: role },
      });
    }
    return { ok: true as const };
  });
}

/** Leave a team you belong to. Your dashboard goes back to your own account. */
export async function leaveTeam(userId: string, accountId: string): Promise<TeamResult> {
  return inTeamTransaction(async (run) => {
    const rows = await run<{ role: string }>(
      `update qr_account_members set removed_at = now(), removed_by = $2
       where account_id = $1 and user_id = $2 and removed_at is null
       returning role`,
      [accountId, userId]
    );
    if (!rows[0]) throw new Refused("You are not in that team.");
    await logEvent(run, { accountId, actorId: userId, subjectId: userId, action: "member.leave", detail: { role: rows[0].role } });
    await run(`delete from qr_active_accounts where user_id = $1`, [userId]);
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// Switching and reading.
// ---------------------------------------------------------------------------

export type AccountChoice = { accountId: string; name: string; role: "owner" | "admin" | "editor" | "viewer" };

/**
 * The accounts someone can work in: their own first, then each team they
 * can use right now (`MEMBER_USABLE_SQL`, the same test `resolveScope`
 * applies), so the switcher never offers a team that would send them home.
 */
export async function accountChoices(userId: string): Promise<AccountChoice[]> {
  const rows = await query<{ account_id: string; name: string; role: AccountChoice["role"] }>(
    `select u.id as account_id, u.name, 'owner' as role, 0 as ord from qr_users u where u.id = $1
     union all
     select m.account_id, o.name, m.role, 1 as ord
     from qr_account_members m join qr_users o on o.id = m.account_id
     where m.user_id = $1 and m.removed_at is null and ${MEMBER_USABLE_SQL}
     order by ord, name`,
    [userId]
  );
  return rows.map((r) => ({ accountId: r.account_id, name: r.name, role: r.role }));
}

/**
 * Point someone's dashboard at an account. Only their own, or a team they
 * are a live member of: the insert selects nothing otherwise, so a posted
 * account id is a request, never an instruction.
 */
export async function switchAccount(userId: string, accountId: string): Promise<boolean> {
  if (accountId === userId) {
    await query(`delete from qr_active_accounts where user_id = $1`, [userId]);
    return true;
  }
  const row = await queryOne<{ user_id: string }>(
    `insert into qr_active_accounts (user_id, account_id)
     select $1, $2
     where exists (
       select 1 from qr_account_members m join qr_users o on o.id = m.account_id
       where m.account_id = $2 and m.user_id = $1 and m.removed_at is null
         and ${MEMBER_USABLE_SQL})
     on conflict (user_id) do update set account_id = excluded.account_id, updated_at = now()
     returning user_id`,
    [userId, accountId]
  );
  return row !== null;
}

export type TeamView = {
  ownerName: string;
  seats: number;
  seatsUsed: number;
  /** `locked`: in the team, but past the plan's seats by join order (`seatState`). */
  members: { userId: string; name: string; email: string | null; role: string; joinedAt: Date; locked: boolean }[];
  invites: { id: string; email: string; role: string; expiresAt: Date }[];
  events: { action: string; actor: string | null; subject: string | null; detail: Record<string, unknown>; at: Date }[];
};

/**
 * The team page's figures. Members see who is in the team and in what role;
 * only the owner sees addresses, pending invites and the log. Every read is
 * of the scope's account, and a member's view proves membership in-query.
 */
export async function teamView(scope: AccountScope): Promise<TeamView | null> {
  const owner = scope.role === "owner";
  const head = await queryOne<{ name: string; features: Record<string, unknown> | null; seats_used: string }>(
    `select u.name, p.features, ${seatsHeldSql(1)} as seats_used
     from qr_users u
     left join qr_subscriptions s on s.user_id = u.id and s.status in ('active', 'past_due')
     left join qr_plans p on p.id = s.plan_id
     where u.id = $1
       and ($1::uuid = $2::uuid or exists (
         select 1 from qr_account_members m
         where m.account_id = $1::uuid and m.user_id = $2::uuid and m.removed_at is null))`,
    [scope.accountId, scope.actorId]
  );
  if (!head) return null;

  const [members, invites, events] = await Promise.all([
    query<{ user_id: string; name: string; email: string; role: string; joined_at: Date }>(
      `select m.user_id, u.name, u.email, m.role, m.joined_at
       from qr_account_members m join qr_users u on u.id = m.user_id
       where m.account_id = $1 and m.removed_at is null
       order by m.joined_at`,
      [scope.accountId]
    ),
    owner
      ? query<{ id: string; email: string; role: string; expires_at: Date }>(
          `select id, email, role, expires_at from qr_account_invites
           where account_id = $1 and accepted_at is null and revoked_at is null and expires_at > now()
           order by created_at`,
          [scope.accountId]
        )
      : Promise.resolve([]),
    owner
      ? query<{ action: string; actor: string | null; subject: string | null; detail: Record<string, unknown>; created_at: Date }>(
          `select e.action, a.name as actor, s.name as subject, e.detail, e.created_at
           from qr_account_events e
           left join qr_users a on a.id = e.actor_id
           left join qr_users s on s.id = e.subject_id
           where e.account_id = $1
           order by e.created_at desc limit 20`,
          [scope.accountId]
        )
      : Promise.resolve([]),
  ]);

  const seats = planSeats(head.features);
  const { locked } = seatState(
    members.map((m) => ({ userId: m.user_id, joinedAt: m.joined_at })),
    seats
  );
  const lockedSet = new Set(locked);
  return {
    ownerName: head.name,
    seats,
    seatsUsed: Number(head.seats_used),
    members: members.map((m) => ({
      userId: m.user_id,
      name: m.name,
      email: owner ? m.email : null,
      role: m.role,
      joinedAt: m.joined_at,
      locked: lockedSet.has(m.user_id),
    })),
    invites: invites.map((i) => ({ id: String(i.id), email: i.email, role: i.role, expiresAt: i.expires_at })),
    events: events.map((e) => ({ action: e.action, actor: e.actor, subject: e.subject, detail: e.detail, at: e.created_at })),
  };
}

// ---------------------------------------------------------------------------
// Staff. Called only from the staff admin, behind `requireStaff` and
// `staffForAction`; staff can see a team and take people out of it, never
// put anyone in.
// ---------------------------------------------------------------------------

export type StaffTeam = {
  seats: number;
  members: { userId: string; name: string; email: string; role: string; joinedAt: Date; locked: boolean }[];
  invites: { id: string; email: string; role: string; expiresAt: Date }[];
  events: { action: string; actor: string | null; subject: string | null; detail: Record<string, unknown>; at: Date }[];
  /** Teams this account belongs to as a member. */
  memberOf: { accountId: string; ownerName: string; ownerEmail: string; role: string; joinedAt: Date }[];
};

export async function teamForStaff(accountId: string): Promise<StaffTeam> {
  const [plan, members, invites, events, memberOf] = await Promise.all([
    queryOne<{ features: Record<string, unknown> | null }>(
      `select p.features from qr_subscriptions s join qr_plans p on p.id = s.plan_id
       where s.user_id = $1 and s.status in ('active', 'past_due') limit 1`,
      [accountId]
    ),
    query<{ user_id: string; name: string; email: string; role: string; joined_at: Date }>(
      `select m.user_id, u.name, u.email, m.role, m.joined_at
       from qr_account_members m join qr_users u on u.id = m.user_id
       where m.account_id = $1 and m.removed_at is null
       order by m.joined_at, m.user_id`,
      [accountId]
    ),
    query<{ id: string; email: string; role: string; expires_at: Date }>(
      `select id, email, role, expires_at from qr_account_invites
       where account_id = $1 and accepted_at is null and revoked_at is null and expires_at > now()
       order by created_at`,
      [accountId]
    ),
    query<{ action: string; actor: string | null; subject: string | null; detail: Record<string, unknown>; created_at: Date }>(
      `select e.action, a.name as actor, s.name as subject, e.detail, e.created_at
       from qr_account_events e
       left join qr_users a on a.id = e.actor_id
       left join qr_users s on s.id = e.subject_id
       where e.account_id = $1
       order by e.created_at desc limit 20`,
      [accountId]
    ),
    query<{ account_id: string; owner_name: string; owner_email: string; role: string; joined_at: Date }>(
      `select m.account_id, o.name as owner_name, o.email as owner_email, m.role, m.joined_at
       from qr_account_members m join qr_users o on o.id = m.account_id
       where m.user_id = $1 and m.removed_at is null
       order by m.joined_at`,
      [accountId]
    ),
  ]);

  const seats = planSeats(plan?.features);
  const { locked } = seatState(
    members.map((m) => ({ userId: m.user_id, joinedAt: m.joined_at })),
    seats
  );
  const lockedSet = new Set(locked);
  return {
    seats,
    members: members.map((m) => ({
      userId: m.user_id,
      name: m.name,
      email: m.email,
      role: m.role,
      joinedAt: m.joined_at,
      locked: lockedSet.has(m.user_id),
    })),
    invites: invites.map((i) => ({ id: String(i.id), email: i.email, role: i.role, expiresAt: i.expires_at })),
    events: events.map((e) => ({ action: e.action, actor: e.actor, subject: e.subject, detail: e.detail, at: e.created_at })),
    memberOf: memberOf.map((m) => ({
      accountId: m.account_id,
      ownerName: m.owner_name,
      ownerEmail: m.owner_email,
      role: m.role,
      joinedAt: m.joined_at,
    })),
  };
}

/**
 * Staff take someone out of a team: on a complaint, or when an account is
 * being cut off from one team without being suspended everywhere. Logged in
 * the team's own log as a staff change, with no staff name, and in the staff
 * audit by the caller.
 */
export async function staffRemoveMember(accountId: string, memberId: string): Promise<TeamResult<{ role: string }>> {
  return inTeamTransaction(async (run) => {
    const rows = await run<{ role: string }>(
      `update qr_account_members set removed_at = now(), removed_by = null
       where account_id = $1 and user_id = $2 and removed_at is null
       returning role`,
      [accountId, memberId]
    );
    if (!rows[0]) throw new Refused("That person is no longer in this team.");
    await logEvent(run, {
      accountId,
      actorId: null,
      subjectId: memberId,
      action: "member.remove",
      detail: { role: rows[0].role, by: "staff" },
    });
    return { ok: true as const, role: rows[0].role };
  });
}

export async function staffRevokeInvite(accountId: string, inviteId: string): Promise<TeamResult<{ role: string }>> {
  return inTeamTransaction(async (run) => {
    const rows = await run<{ role: string }>(
      `update qr_account_invites set revoked_at = now()
       where id = $1 and account_id = $2 and accepted_at is null and revoked_at is null
       returning role`,
      [inviteId, accountId]
    );
    if (!rows[0]) throw new Refused("That invite has already been used or cancelled.");
    await logEvent(run, { accountId, actorId: null, action: "invite.revoke", detail: { inviteId, by: "staff" } });
    return { ok: true as const, role: rows[0].role };
  });
}
