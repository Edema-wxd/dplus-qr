-- 033: a new account's codes do not serve until its email is confirmed.
--
-- Security audit M3 (10 November 2026): an account nobody had verified could
-- create live `qriateplus.com/<code>` links at once, so a script with
-- disposable addresses could mint trusted-looking short links to a phishing
-- page. From now on an account that signs up unverified is created with
-- `codes_held_since` set, and while it is set the redirect answers every one of
-- its codes with the paused page (DECISIONS.md, 11 November 2026).
--
-- `ensureProfile()` sets it only when it *creates* the profile row, and clears
-- it the first time the session reports the email verified. It is never set on
-- an existing row, so:
--   - every account that exists before this migration keeps serving, verified
--     or not: a printed code must keep working;
--   - once released, a hold never comes back, even if the person later changes
--     to an address they have not confirmed yet.
--
-- Read on the redirect path, from `qr_users`, which that query already joins
-- for the owner's name and suspension. Neon Auth's own `emailVerified` is
-- deliberately not read there: that table belongs to a managed service that
-- may reshape it, and the one scan query must not depend on it.
--
-- Additive only: one nullable column, no default, no rewrite of existing rows.

alter table qr_users
  add column codes_held_since timestamptz;
