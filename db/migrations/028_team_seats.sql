-- 028: team seats, the schema.
--
-- An account stays what it has always been: the owner's qr_users row, whose
-- id every code, subscription, logo, file and share link is keyed on. A
-- team is that account plus members, so nothing that exists is altered:
-- not qr_codes, which the redirect reads, nor qr_users or qr_subscriptions,
-- which it joins. Four new tables and one plan-row update.
--
-- Built in stages (docs/qr-platform/plans/team-seats.md). Until the invite
-- flow ships nothing writes these tables, and the dashboard behaves exactly
-- as before.

-- Who belongs to which account, and as what. The owner is implicit (the
-- account id is their user id), so a member row is never the owner's own.
-- Removing a member stamps removed_at rather than deleting, so the team log
-- can still say who was there.
create table qr_account_members (
  id          bigserial    primary key,
  account_id  uuid         not null references qr_users (id) on delete restrict,
  user_id     uuid         not null references qr_users (id) on delete restrict,
  -- 'admin' is allowed here but not offered yet (decided 7 Nov 2026).
  role        text         not null check (role in ('admin', 'editor', 'viewer')),
  invited_by  uuid         references qr_users (id) on delete set null,
  joined_at   timestamptz  not null default now(),
  removed_at  timestamptz,
  removed_by  uuid         references qr_users (id) on delete set null,
  check (account_id <> user_id)
);

create unique index qr_account_members_live_idx
  on qr_account_members (account_id, user_id) where removed_at is null;
create index qr_account_members_user_idx
  on qr_account_members (user_id) where removed_at is null;

-- An invitation by email. Only a hash of the token is kept: the token
-- itself is only ever in the email, so a read of this table cannot be used
-- to join a team.
create table qr_account_invites (
  id           bigserial    primary key,
  account_id   uuid         not null references qr_users (id) on delete restrict,
  -- Lower-cased.
  email        text         not null,
  role         text         not null check (role in ('admin', 'editor', 'viewer')),
  token_hash   text         not null unique,
  invited_by   uuid         references qr_users (id) on delete set null,
  created_at   timestamptz  not null default now(),
  expires_at   timestamptz  not null,
  accepted_at  timestamptz,
  accepted_by  uuid         references qr_users (id) on delete set null,
  revoked_at   timestamptz
);

create unique index qr_account_invites_pending_idx
  on qr_account_invites (account_id, email)
  where accepted_at is null and revoked_at is null;

-- The customer-facing team log: invites, joins, role changes, removals.
-- Ids and roles only in detail, never an email address.
create table qr_account_events (
  id          bigserial    primary key,
  account_id  uuid         not null references qr_users (id) on delete restrict,
  actor_id    uuid         references qr_users (id) on delete set null,
  subject_id  uuid         references qr_users (id) on delete set null,
  action      text         not null,
  qr_id       bigint       references qr_codes (id) on delete set null,
  detail      jsonb        not null default '{}'::jsonb,
  created_at  timestamptz  not null default now()
);

create index qr_account_events_account_idx on qr_account_events (account_id, created_at desc);

-- Which account a person's dashboard shows. In the database rather than a
-- cookie: the privacy policy promises one cookie, the session.
create table qr_active_accounts (
  user_id     uuid         primary key references qr_users (id) on delete restrict,
  account_id  uuid         not null references qr_users (id) on delete restrict,
  updated_at  timestamptz  not null default now()
);

-- team_seats becomes a count of people, owner included (decided 7 Nov 2026:
-- five on Business). Migration 013 stored it as `true`; staff change the
-- number per plan from /admin/plans.
update qr_plans
   set features = jsonb_set(features, '{team_seats}', to_jsonb(5))
 where features->>'team_seats' = 'true';
