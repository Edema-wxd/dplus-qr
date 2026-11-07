# Plan: Team seats

**Status: proposed, not approved.** Drafted 6 November 2026 from a review of
the code as it stood that day. Per CLAUDE.md, nothing here is built until
Francis has answered the decisions at the end and approved the plan.

**Migration number:** this plan says `025`, which `025_feedback_context`
(PR #34) has since taken. Use the next free number when building, and update
`LATEST_MIGRATION` in `src/lib/schema-version.ts`.

---

Based on CLAUDE.md, DECISIONS.md, HANDOVER.md, INFRASTRUCTURE.md and the code the feature touches. Seven facts set the shape of the plan:

1. **The redirect needs no change if the owner stays the account.** `LOOKUP_SQL` in `src/lib/codes.ts` joins only `qr_users u on u.id = c.user_id` and `qr_subscriptions s on s.user_id = c.user_id`. So if `qr_codes.user_id` keeps meaning "the account", and the account is the owner's `qr_users` row, scans are untouched.
2. **There is already an actor column.** `qr_destination_history.changed_by` (migration 005, `on delete set null`) records who made a change. Today `changeDestination` writes `$1`, the owner. With teams it must write the session user.
3. **The plan flag has the wrong type.** `team_seats` is a boolean, set `true` on the four business rows by migration 013. It also has to carry a count.
   - `featuresFromForm` silently deletes a non-integer from a `number` feature.
   - `upgrade-offers.ts:121` matches features with `=== true`.
   - `advertisedFeatures` has no branch for `number` features.
4. **No account switcher in a cookie.** The privacy policy promises one cookie, the session (DECISIONS, 5 Nov). The selected account has to be stored in the database.
5. **Neon Auth has an organization plugin.** The SDK exposes `organization/invite-member` and `organization/accept-invitation` through `/api/auth/[...path]`. It can't enforce plan-based seat limits, it sends mail through the managed SMTP instead of `sendEmail`, and its tables belong to the managed service. That is the same reason there is no foreign key to `neon_auth."user"`.
6. **Sign-in and sign-up always redirect to `/app`.** `signup-source.ts` already shows how to carry a value through the form in a hidden field without a cookie.
7. **Retention ignores accounts with no subscription row.** The candidate query joins `qr_subscriptions`. Every signed-in user gets the free plan from `ensureProfile`, so members are never swept as "lapsed".

---

## 1. Data model

**An account is the owner's `qr_users` row, and the account id is the owner's user id.** Codes, subscriptions, logos, files and share links stay keyed on `user_id` and now mean "account".
- No backfill.
- No change to `qr_codes`, `qr_users` or `qr_subscriptions`.
- `on delete restrict` holds as it is.
- The Paystack `metadata.user_id`, the owner name on the paused page and the retention sweep are unchanged.
- I rejected a new `qr_accounts` table with `qr_codes.account_id`: it would add a join to the redirect and needs a backfill of the redirect table.

**Migration `025_team_seats.sql`** creates four new tables and runs one data update. Nothing existing is altered.

```sql
create table qr_account_members (
  id          bigserial primary key,
  account_id  uuid not null references qr_users (id) on delete restrict,
  user_id     uuid not null references qr_users (id) on delete restrict,
  role        text not null check (role in ('admin','editor','viewer')),  -- owner is implicit: account_id = user id
  invited_by  uuid references qr_users (id) on delete set null,
  joined_at   timestamptz not null default now(),
  removed_at  timestamptz,
  removed_by  uuid references qr_users (id) on delete set null,
  check (account_id <> user_id)
);
create unique index qr_account_members_live_idx on qr_account_members (account_id, user_id) where removed_at is null;
create index qr_account_members_user_idx on qr_account_members (user_id) where removed_at is null;

create table qr_account_invites (
  id          bigserial primary key,
  account_id  uuid not null references qr_users (id) on delete restrict,
  email       text not null,                 -- lowercased
  role        text not null check (role in ('admin','editor','viewer')),
  token_hash  text not null unique,          -- sha256 of a 32-byte base64url token; the raw token is only ever in the email
  invited_by  uuid references qr_users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  accepted_at timestamptz, accepted_by uuid references qr_users (id) on delete set null,
  revoked_at  timestamptz
);
create unique index qr_account_invites_pending_idx on qr_account_invites (account_id, email)
  where accepted_at is null and revoked_at is null;

create table qr_account_events (            -- the customer-facing team log
  id bigserial primary key,
  account_id uuid not null references qr_users (id) on delete restrict,
  actor_id   uuid references qr_users (id) on delete set null,
  subject_id uuid references qr_users (id) on delete set null,
  action     text not null,                  -- invite.create|invite.revoke|invite.accept|member.role|member.remove|member.leave|code.create
  qr_id      bigint references qr_codes (id) on delete set null,
  detail     jsonb not null default '{}'::jsonb,   -- ids and roles only, never an email
  created_at timestamptz not null default now()
);
create index qr_account_events_account_idx on qr_account_events (account_id, created_at desc);

create table qr_active_accounts (           -- which account the dashboard shows; stored here because a cookie would break the privacy policy
  user_id    uuid primary key references qr_users (id) on delete restrict,
  account_id uuid not null references qr_users (id) on delete restrict,
  updated_at timestamptz not null default now()
);

update qr_plans set features = jsonb_set(features, '{team_seats}', to_jsonb(<N>))   -- N from Francis
 where features->>'team_seats' = 'true';
```

Notes on the migration:
- **Locks:** the foreign keys take `SHARE ROW EXCLUSIVE` on `qr_users`. That blocks writes for a moment but not the redirect's reads, and it stays inside the 5-second `lock_timeout`.
- **Code creator:** this goes in `qr_account_events` (`code.create`, `qr_id`). The alternative was a `qr_codes.created_by` column, and leaving it out keeps the redirect table untouched.
- **Deploy order doesn't matter.** Code reads `team_seats` only as a positive integer, so a leftover `true` means "no team".

## 2. How "filter by the session's user id" becomes a membership check

The session user id stays in every query. Each statement checks membership itself, so there is still no fetch-then-check. A new module, `src/lib/account-scope.ts`, holds all of it:

```ts
export type Role = "owner" | "admin" | "editor" | "viewer";
export type AccountScope = { readonly accountId: string; readonly actorId: string; readonly role: Role; readonly [brand]: true };
// $1 = account id, $2 = session user id, $3 = roles allowed for this statement
export const ACCESS = `($1::uuid = $2::uuid or exists (
  select 1 from qr_account_members m
  where m.account_id = $1 and m.user_id = $2 and m.removed_at is null and m.role = any($3::text[])))`;
export const resolveScope = cache(async (): Promise<AccountScope | null> => ...);
export function scopeParams(scope: AccountScope, action: Action): [string, string, string[]];
```

- **Only `resolveScope` creates a scope.** The brand is not exported. It reads the session, runs `ensureProfile`, reads `qr_active_accounts`, and confirms the membership.
  - It falls back to the user's own account when the membership is gone, locked by seats, or the owner's account is lapsed, suspended, archived or erased.
  - It is wrapped in React `cache()`, like `readEntitlement`.
- **Every scoped statement becomes `where c.user_id = $1 and ${ACCESS}`.**
  - Inserts become `insert ... select ... where ${ACCESS}`.
  - Writes pass the editor role list. Reads pass every role.
  - A member removed in the middle of a request gets nothing back from the next statement.
- **Modules converted** from `(userId, ...)` to `(scope, ...)`:
  - `user-codes.ts` (every function)
  - `logos.ts`
  - `files.ts` (`resolveFiles`, `listFileLibrary`)
  - `stat-shares.ts` (`getLiveShare`, `createShare`, `revokeShare`)
  - `entitlement.getEntitlement`, which takes the account id from the scope
  - `plan-read.ts`
  - `app/(app)/app/actions.ts`
  - the routes `[id]/qr`, `[id]/export` and `[id]/export/feedback`
  - the `api/uploadthing/core.ts` middleware, which needs editor or above, with `metadata` carrying the account id
- **Unchanged:** `loadSharedCode`, `/p`, `/s` and the redirect. They already key on the code's owner, which is the account.
- **History records the person.** `changeDestination` writes `changed_by = $2`, the session user, instead of the owner.
- **Forms are pinned to the account they were drawn for.** Dashboard forms carry a hidden `accountId`. Each action refuses if it differs from the resolved scope ("You switched accounts in another tab; reload"). It is only compared, never used for authorisation. This stops a form drawn for team A from creating a code in the personal account after a switch in another tab.

## 3. Roles

| Action | owner | admin* | editor | viewer |
|---|---|---|---|---|
| See codes, analytics, history, files; download QR artwork | ✓ | ✓ | ✓ | ✓ |
| CSV exports (plan `csv_export` still applies) | ✓ | ✓ | ✓ | ✓ |
| Create, rename, re-point, edit content, pause and resume, colours, logos, uploads, share links | ✓ | ✓ | ✓ | – |
| Invite, revoke, change role, remove members | ✓ | non-admin members only | – | – |
| Billing (checkout, cancel), plan changes | ✓ | – | – | – |
| Leave team | – | ✓ | ✓ | ✓ |

\* `admin` is allowed by the check constraint now, but the app only offers it if Francis chooses it (decision 4).

**Billing stays the owner's own account.** `/billing` keeps using `session.user.id`, since only an owner pays for their own account. Members see "Billing is managed by {account name}".

**Plan limits apply to the team as a whole.**
- **`max_codes`:** codes belong to the account, so `getEntitlement`'s count is already per team. A member's codes count against the team.
- **Personal accounts are separate.** A member's own account keeps its own free-plan quota.
- **Gates:** every `can*` gate reads the team's entitlement.
- **New entitlement fields:** `seats` (`features.team_seats`, as a positive integer, or 0) and `seatsUsed`, which is 1 (the owner) plus live members plus unexpired pending invites.
- **New pure functions:**
  - `canInvite(entitlement, scope)`
  - `seatState(members ordered by joined_at, seats)`, which returns who is active and who is locked
  - `roleAllows(role, action)`

## 4. Invites

- **Identity comes from Neon Auth. Membership lives in our tables.** The Neon Auth organization plugin stays off: check with `neon neon-auth status`, and note it in DECISIONS.md.
- **Creating an invite** (`createInvite` in a new `src/lib/team.ts`):
  - Validated with zod: email, role.
  - Refused for the owner's own email, an existing member, or a pending duplicate.
  - Runs in `withTransaction` under `select ... from qr_users where id = $1 for update`. That lock serialises seat use against concurrent invites and accepts, and plain reads by the redirect are unaffected.
  - Seat check: `seatsUsed < seats`. Expiry is 7 days.
  - Rate limited with a new `allowInvite(accountId)` in `src/lib/ratelimit.ts`, for example 20 a day. It fails open like the others, and the seat cap still bounds it.
- **Sending the invite:**
  - `sendEmail({ group: "onboarding", to, subject, text })`, with the link `${QR_BASE_URL}/auth/invite/{token}`.
  - The account name has newlines stripped and its length capped in the subject.
  - The reply-to is the existing apex address, so `email-groups.test.ts` covers it.
  - If `sendEmail` returns false, the invite is revoked in the same action and an inline error is shown. This follows the retention rule that a failed email records nothing.
  - The response never says whether the address already has an account.
- **Accepting: `/auth/invite/[token]`.** It sits under the reserved `auth` segment and outside the `proxy.ts` matcher, so signed-out visitors can reach it. `RESERVED_CODES` is unchanged and `custom-codes.test.ts` still passes.
  - A malformed token gets the not-found page with no query.
  - Signed out, the page shows the account name and role, plus sign-in and sign-up links with `?invite=`.
  - The sign-in and sign-up actions carry `invite` as a hidden field (the signup-ref pattern). After success they redirect to `/auth/invite/{token}`. The path is built on the server from a format-checked token, so there is no open redirect.
  - Signed in, the page requires `session.user.emailVerified` and `lower(session email) = invite.email`. Otherwise it explains, with the invite address masked.
- **The accept Server Action** runs one transaction under the same account row lock. It:
  - checks the invite is live;
  - re-checks seats and that the account is active;
  - inserts the member;
  - marks the invite accepted;
  - records `invite.accept`;
  - sets `qr_active_accounts` to the team.

  The invitee keeps their own free account from `ensureProfile`, which is unchanged.
- **Switching accounts:** a switcher in `DashShell`/`DashNav` upserts `qr_active_accounts`, but only `where account_id = user_id or exists (live membership)`.

## 5. Lapse, suspension and seat shortfall

- **Lapsed plan** (grace over and cancelled, or no plan):
  - Codes pause as today.
  - Every non-owner is locked: `resolveScope` falls back, and a "This team's plan is not active; {owner} manages billing" notice is shown.
  - Memberships and invites are kept, so paying again brings access back at once.
  - Pending invites can't be accepted.
- **Owner's account suspended or archived:** members are locked the same way, memberships are kept, and unarchiving restores access.
- **Seats below members.** This happens if staff lower `team_seats` or take the flag off a plan.
  - `seatState` keeps the earliest-joined members active up to the limit and locks the rest.
  - The owner sees "N members are over your plan" on `/app/team`.
  - New invites are refused.
- **Voluntary downgrade** follows the existing rule for codes:
  - `planRefusal(plan, codesHeld, seatsHeld)` in `checkout.ts` refuses with "Remove N members first".
  - `assignRefusal({ ..., seatsHeld })` in `plan-admin.ts` refuses with "choose a larger plan".
  - There is no new writer of `qr_subscriptions`.

## 6. Staff admin, audit, suspension and erasure

**What staff see:**
- `getCustomer` in `admin-billing.ts` adds a Team section (members, roles, joined date, pending invites, last 20 events) and a "Member of" section.
- The customer list shows a member count.
- The staff code page already shows `changed_by`, which will now name the member who made the change.

**Staff actions**, in `moderation-actions.ts`:
- "Remove from team" and "Revoke invite", each through `staffForAction()`, zod and `recordChange(staff, "team.member.remove" | "team.invite.revoke", "customer", accountId, { memberId, role })`, with ids and never emails.
- Staff never add members. `guard.ts` itself is unchanged.

**Customer-side team actions** write `qr_account_events`, which owners and admins can read on `/app/team`.

**Suspending a member:** `suspendAccount` still affects only that person's own codes, and team access stays. To cut a person off from a team, staff use "Remove from team", or Neon Auth `banned` to stop sign-in.

**Erasing a member:**
- `eraseAccountData` gains, inside its transaction and before blanking the email:
  - delete their `qr_account_members` rows;
  - delete invites sent to their email;
  - delete their `qr_active_accounts` row;
  - null `actor_id` and `subject_id` in events.
- `changed_by` is already nulled.
- The team's codes are untouched, because the account owns them.

**Erasing the owner** (by staff, or by the retention sweep through the same function):
- The same transaction deletes the account's members, invites, events and the `qr_active_accounts` rows that point at it.
- Members' own accounts are untouched.
- `erasePrecheck` returns the member count, so the confirm screen says how many people lose access.
- The retention warning still goes to the owner only.

## 7. Keeping the redirect safe

- `LOOKUP_SQL`, `Destination`, `decide()` and the cache keys are unchanged.
- Membership changes need no cache purge, because the redirect never reads membership.
- **New test `src/__tests__/redirect-lookup.test.ts`** reads `src/lib/codes.ts`. It asserts:
  - `LOOKUP_SQL` names only `qr_codes`, `qr_users` and `qr_subscriptions`;
  - it contains no `qr_account`.
- `redirect-isolation.test.ts` must keep `account-scope.ts` out of the redirect's import graph.
- Migration 025 alters nothing that already exists. Production builds apply it before `next build`.
- **Check:** scan a seeded code with `curl -I` before and after the production deploy.

---

## Ordered implementation steps (one PR each, branch `qr/team-seats-N`)

1. **Schema.**
   - Files: `db/migrations/025_team_seats.sql` and `redirect-lookup.test.ts`.
   - Done when: `npm run db:migrate` is clean on a fresh and on a migrated local Postgres; `db:migrate:status` on a preview only reports; every existing test passes; a seeded code still returns 302 after the deploy.
2. **Scope seam, with no behaviour change.**
   - Files: `src/lib/account-scope.ts`, then convert `user-codes.ts`, `logos.ts`, `files.ts`, `stat-shares.ts`, `entitlement.ts` (param renamed to `accountId`), `plan-read.ts`, `app/actions.ts`, the three routes and `uploadthing/core.ts`. Add the hidden `accountId` to forms, and set `changed_by` to the session user.
   - Tests:
     - `roleAllows` and `scopeParams`;
     - a new `scope-guard.test.ts` that parses those modules and fails if any SQL template touching `qr_codes|qr_logos|qr_files|qr_stat_shares|qr_feedback|qr_scans|qr_destination_history` lacks `${ACCESS}`.
   - Done when: with no members, an owner's dashboard behaves identically on local; a tampered `accountId` or code id is refused or 404s; `env -i PATH="$PATH" HOME="$HOME" npx next build` passes.
3. **Seat rules and the plan flag.**
   - `plan-features.ts`: `team_seats` becomes `kind: "number"`, `min: 2`, `max: 50`, still `built: false`, with "Up to N people" added to `advertisedFeatures`.
   - `plans.ts`: `team_seats?: number`.
   - `upgrade-offers.ts`: numeric gates match on `> 0`.
   - Entitlement gains `seats` and `seatsUsed`, plus `canInvite` and `seatState`.
   - `planRefusal` and `assignRefusal` gain seat checks.
   - Tests: `checkout.test.ts`, `plan-gates.test.ts`, `upgrade-offers.test.ts`, `admin.test.ts`.
   - Done when: the admin plan form saves a seat number; a downgrade below members is refused with an actionable message.
4. **Invites and membership.**
   - Files:
     - `src/lib/team.ts`: create, revoke, accept, remove, change role, leave, list, events
     - `ratelimit.allowInvite`
     - the invite email text through `sendEmail` with the onboarding group
     - `/app/team` page and actions, using `instant = false` and `await connection()`
     - `/auth/invite/[token]` page and action
     - a hidden `invite` field in the sign-in and sign-up actions
     - the account switcher
   - Tests:
     - token format and hashing;
     - `maskEmail`;
     - invite refusals (own email, already a member, duplicate, no seats, expired, wrong or unverified email);
     - an `email-groups.test.ts` case for the invite.
   - Manual checks on local Postgres:
     - two concurrent accepts on the last seat, where one fails;
     - a removed member's next request returns 404;
     - a member sees the team's codes and not the owner's other accounts;
     - with no Resend key, no invite is left behind.
5. **Locks and role-aware UI.**
   - The holding notice for locked members.
   - Editor-only controls disabled for viewers with "Ask the account owner". This is not `UpgradeDialog`, which is about plans.
   - The `/billing` notice for non-owners.
   - Done when: lapse, suspension, archive and over-seat each lock members and keep the owner; paying or unarchiving restores access without a deploy.
6. **Staff admin and erasure.**
   - `admin-billing.getCustomer` sections, the staff remove and revoke actions with `recordChange`, the `eraseAccountData` and `erasePrecheck` additions.
   - Tests: `moderation.test.ts` (precheck facts) and `retention.test.ts` (unchanged candidate rules).
   - Done when: on local, erasing a member leaves the team's codes and history intact with the actor nulled; erasing the owner removes every membership and invite; each staff action writes one audit row with no email.
7. **Launch.**
   - Privacy and Terms copy through `legal.ts`, with `legal.test.ts` assertions: invitee emails are processed to send invites, members see the account's data, and the owner is responsible for members.
   - Set `built: true` and set seat numbers through `/admin/plans`.
   - Add a DECISIONS.md entry, including the restated query rule ("filters by the session's user id through `ACCESS`"), and update the CLAUDE.md Non-negotiables and Status.
   - Done when: `/pricing` shows the seat line from data, `npm run build` and `npm test` pass, and Francis approves.

---

## Business decisions for Francis (my recommendation after each)

1. Which plans include seats, and how many? **Business monthly and annual only; 5 people.**
2. Does the owner count as a seat? **Yes. "5 people" means the owner plus 4.**
3. Can extra seats be bought as an add-on? **No, not in v1.** A Paystack plan has a fixed price with no quantity, and an account has one live subscription (the partial unique index). A bigger team is a new plan row staff can create without a deploy.
4. Which roles? **Owner, editor and viewer. `admin` is allowed in the schema but not offered yet.**
5. Can viewers download QR artwork and CSV exports? **Yes. It is data they can already see, and printing needs the artwork.**
6. Do pending invites hold a seat, and when do they expire? **Yes; after 7 days.**
7. What do members get when the plan lapses or the account is suspended? **They are locked out with a notice. Memberships are kept and come back on payment.**
8. If seats drop below members, who keeps access? **The earliest-joined members. The rest are paused until the owner removes someone.**
9. Does an invited person also get their own free account? **Yes, as every sign-in does today.**
10. Can one person belong to several teams? **Yes, with a switcher stored in the database (no cookie).**
11. Can ownership be transferred? **Not in v1. Support changes the owner's login email instead.**
12. Which sender do invite emails use? **`onboarding@`, capped at 20 a day per account plus the seat limit.** A fourth group is the safer option for password-reset deliverability if invite volume grows.
13. Should invitees have to verify their email before accepting? **Yes, and the email must match the invite.**
14. Can staff add members or only remove them? **View, remove and revoke only.**
15. Should members be emailed when the account is erased or they are removed? **No for erasure. A plain notice for removal is optional; I'd skip it in v1.**
16. Does the legal text need a lawyer's pass before launch? **Yes. Update the drafts now and fold them into the existing review before live payments.**

### Critical Files for Implementation
- src/lib/user-codes.ts
- src/lib/entitlement.ts
- src/lib/moderation.ts
- src/lib/plan-features.ts
- src/lib/codes.ts (must stay unchanged; guarded by the new test)

Also touched: `src/lib/checkout.ts`, `src/lib/plan-admin.ts`, `src/lib/admin-billing.ts`, `src/lib/upgrade-offers.ts`, `src/lib/email.ts` (caller only), `src/lib/ratelimit.ts`, `src/app/api/uploadthing/core.ts`, `src/app/(app)/app/actions.ts`, `src/app/(app)/auth/sign-in/actions.ts`, `src/app/(app)/auth/sign-up/actions.ts`, `src/app/(admin)/admin/moderation-actions.ts`, and the new `db/migrations/025_team_seats.sql`.