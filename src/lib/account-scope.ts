
/**
 * Which account a dashboard request acts on, as whom, and with what role.
 *
 * Team seats (docs/qr-platform/plans/team-seats.md) keep an account as what
 * it always was: the owner's `qr_users` row, whose id every code, logo,
 * file and share link is keyed on. A member works in someone else's account,
 * so "filter by the session's user id" becomes "filter by the account, and
 * prove in the same statement that the session's user may act on it". That
 * proof is `access()` below, and every scoped statement carries it, so there
 * is still no fetch-then-check: a member removed in the middle of a request
 * gets nothing from the next statement.
 *
 * With no members, the account is the session user, `access()` reduces to
 * `$1 = $n`, and nothing behaves differently from before.
 *
 * Pure, so the libraries that build queries import it without pulling in
 * the session; `resolveScope`, which reads the session, is in
 * `resolve-scope.ts`.
 */

const brand: unique symbol = Symbol("AccountScope");

/** `owner` is implicit (the account is the person's own); the rest are member rows. */
export type Role = "owner" | "admin" | "editor" | "viewer";
type MemberRole = Exclude<Role, "owner">;

/**
 * What a statement does. `read` is anything a viewer may see, including
 * downloads and exports (decided 7 Nov 2026); `write` changes the account's
 * codes, logos, files or share links.
 */
export type Action = "read" | "write";

export type AccountScope = {
  /** The owner's user id: what every scoped row is keyed on. */
  readonly accountId: string;
  /** The person signed in: who did it, for history and the team log. */
  readonly actorId: string;
  readonly role: Role;
  readonly [brand]: true;
};

/** Member roles each action admits. The owner is admitted by `$1 = actor`. */
const MEMBER_ROLES: Record<Action, readonly MemberRole[]> = {
  read: ["admin", "editor", "viewer"],
  write: ["admin", "editor"],
};

export function roleAllows(role: Role, action: Action): boolean {
  return role === "owner" || (MEMBER_ROLES[action] as readonly string[]).includes(role);
}

/**
 * The SQL that proves the actor may act on the account, for a statement
 * whose `$1` is the account id and whose `$n` and `$n+1` are what
 * `accessArgs` returns, appended after its own parameters.
 *
 * The owner passes on the first comparison and never touches the members
 * table, which is how a solo account costs nothing extra.
 */
export function access(n: number): string {
  return `($1::uuid = $${n}::uuid or exists (
    select 1 from qr_account_members m
    where m.account_id = $1::uuid and m.user_id = $${n}::uuid
      and m.removed_at is null and m.role = any($${n + 1}::text[])))`;
}

/** The two parameters `access(n)` reads: the actor, and the roles this action admits. */
export function accessArgs(scope: AccountScope, action: Action): [string, string[]] {
  return [scope.actorId, [...MEMBER_ROLES[action]]];
}

/**
 * Build a scope. Only `resolveScope` (`resolve-scope.ts`) should, from a
 * session; the tests do too. `src/__tests__/scope-guard.test.ts` fails if anything else imports
 * it, because a scope made from a guessed id is exactly what this module
 * exists to prevent.
 */
export function scopeFor(accountId: string, actorId: string, role: Role): AccountScope {
  return Object.freeze({ accountId, actorId, role, [brand]: true as const });
}

export function isMemberRole(value: string): value is MemberRole {
  return value === "admin" || value === "editor" || value === "viewer";
}

/**
 * A scope that may write, or the sentence a viewer is shown instead. Server
 * Actions call this first; the statements check again regardless.
 */
export function writable(
  scope: AccountScope
): { ok: true; scope: AccountScope } | { ok: false; reason: string } {
  return roleAllows(scope.role, "write")
    ? { ok: true, scope }
    : { ok: false, reason: "You can view this account but not change it. Ask the account owner." };
}
