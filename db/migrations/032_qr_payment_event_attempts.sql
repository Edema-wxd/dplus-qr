-- 032: Paystack events can be attempted again.
--
-- Until now the log row was the idempotency guard and nothing else: a row that
-- existed was never processed twice, so an event whose processing threw (a
-- database cold start, a deploy mid-request) stayed unapplied forever and
-- Paystack's own re-delivery of it was dropped as a duplicate. From now on only
-- a *processed* row stops a delivery (DECISIONS.md, 11 November 2026). An
-- unprocessed one is claimed and tried again.
--
-- `claimed_at` is the lease that stops two attempts running at once: Paystack
-- re-sends while a slow first attempt is still working, and both must not
-- apply the same charge. A claim older than two minutes is treated as dead.
-- `attempts` counts claims, so staff can tell a stuck event from a new one.
--
-- Additive only: two nullable or defaulted columns, no rewrite of existing rows.

alter table qr_payment_events
  add column attempts   integer      not null default 0,
  add column claimed_at timestamptz;
