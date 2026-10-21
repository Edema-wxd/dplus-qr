-- 002: client profiles.
--
-- Accounts themselves live in `neon_auth."user"`, owned by Neon Managed Better
-- Auth: credentials, email verification, password reset, sessions and the
-- `role` / `banned` columns are all theirs. This table holds only what the QR
-- platform adds on top, keyed by the same uuid.
--
-- Rewritten (21 Oct 2026) when Neon Auth replaced the planned self-managed
-- next-auth setup. Safe to edit rather than supersede: no migration in this
-- directory had been applied to any database at that point.
--
-- Deliberately NOT a foreign key to neon_auth."user". That table belongs to a
-- managed service which may rename or reshape it, and a cross-schema FK would
-- make our migrations hostage to that. Referential integrity we do control --
-- qr_codes -> qr_users -- is enforced below and in 005.

create table qr_users (
  -- Equal to neon_auth."user".id. Not generated here.
  id                      uuid         primary key,

  -- Denormalised from neon_auth for admin search and for naming the business
  -- on a paused page without a cross-schema join on the redirect path.
  -- Kept in step by ensureProfile(); neon_auth remains the source of truth.
  email                   text         not null,
  name                    text         not null,

  paystack_customer_code  text,

  -- Platform-level suspension, distinct from Neon Auth's `banned`: this stops
  -- codes serving, it does not stop the person logging in to fix their billing.
  suspended_at            timestamptz,

  created_at              timestamptz  not null default now(),
  updated_at              timestamptz  not null default now()
);

-- Admin search. Not unique: uniqueness is Neon Auth's to enforce, and a copy
-- that rejected a mid-change duplicate would break the account, not protect it.
create index qr_users_email_idx on qr_users (lower(email));
