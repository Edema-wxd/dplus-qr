-- 020: when an account was last warned that its data is about to be deleted.
--
-- The retention sweep (`src/lib/retention.ts`) erases an account six months
-- after it lapses, as the Terms and Privacy Policy promise, but only once a
-- warning has gone out at least 30 days before. This is that record. A warning
-- older than the account's latest lapse does not count (they came back and
-- lapsed again), so the sweep warns afresh.

alter table qr_users add column retention_warned_at timestamptz;
