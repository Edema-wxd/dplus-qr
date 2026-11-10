-- 029: the first-code onboarding, and how far each account got through it.
--
-- A new account is walked from sign-up to its first code and a test scan in
-- at most seven steps (`ONBOARDING_STEPS` in src/lib/onboarding-steps.ts, held to
-- that by a test). Each step an account reaches is written here once, with
-- the time, so staff can see where people stop.
--
-- Two tables, for two jobs:
--
-- - `qr_onboarding` is one row per account: where it came from, what the
--   person said the code is for, the draft carried between screens, and
--   whether they finished or skipped (and from which screen).
-- - `qr_onboarding_steps` is the funnel itself: the first time each step was
--   reached. One row per account and step, so a reload or a second download
--   never counts twice, and the time between two rows is the time a person
--   spent on that screen.
--
-- The draft holds the destination typed on screen 3 until screen 4 makes the
-- code. It is server-side so it never rides in a URL and survives a switch of
-- device. Account erasure deletes both tables' rows.
--
-- Scans are deliberately not written here. Whether a code has been scanned is
-- read from qr_scans and qr_scan_daily when the funnel is drawn, so the
-- redirect path gains no write and no query.

create table qr_onboarding (
  user_id       uuid         primary key references qr_users (id) on delete cascade,
  -- 'signup' for accounts created since this shipped; 'existing' for older
  -- accounts with no codes that are walked through it on their next visit.
  -- The funnel counts only 'signup', so old accounts do not skew it.
  origin        text         not null check (origin in ('signup', 'existing')),
  purpose       text         check (purpose in ('packaging', 'print', 'card', 'venue', 'event', 'other')),
  draft         jsonb        not null default '{}'::jsonb,
  code_id       bigint       references qr_codes (id) on delete set null,
  started_at    timestamptz  not null default now(),
  skipped_at    timestamptz,
  skipped_step  text,
  completed_at  timestamptz,
  updated_at    timestamptz  not null default now()
);

create index qr_onboarding_started_idx on qr_onboarding (started_at);

create table qr_onboarding_steps (
  user_id     uuid         not null references qr_onboarding (user_id) on delete cascade,
  step        text         not null check (step in (
                'account_created', 'purpose_chosen', 'destination_set', 'code_created',
                'artwork_downloaded', 'test_scanned', 'completed'
              )),
  reached_at  timestamptz  not null default now(),
  primary key (user_id, step)
);
