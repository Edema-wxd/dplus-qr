-- 011: the policy numbers billing needs, in the table rather than in code.
--
-- Migration 003 put limits in `qr_plans` so that changing what a plan allows is
-- an UPDATE rather than a deploy. A grace period is the same kind of number, so
-- it goes here too rather than becoming a constant in the webhook handler:
--
--   update qr_plans set grace_days = 14 where slug = 'pro';
--
-- 7 days is the figure DECISIONS.md proposes and still lists as open, so it is
-- a default, not a settled value.
--
-- The free plan gets 0: there is no renewal to fail, so a grace period would be
-- meaningless rather than generous.

alter table qr_plans
  add column grace_days integer not null default 7;

update qr_plans set grace_days = 0 where amount_kobo = 0;

alter table qr_plans
  add constraint qr_plans_grace_days_check check (grace_days between 0 and 90);

-- Renewals are matched to a plan by the Paystack plan code on the way in. The
-- column is already unique, but a webhook looks it up on every charge and a
-- unique index on a nullable column is not usable for that when most rows are
-- null -- so index the ones that have a code.
create index qr_plans_paystack_code_idx
  on qr_plans (paystack_plan_code)
  where paystack_plan_code is not null;
