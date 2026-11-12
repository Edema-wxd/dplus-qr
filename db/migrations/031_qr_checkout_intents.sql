-- 031: the checkouts this app starts.
--
-- Paystack's `subscription.create` carries no metadata, so on its own it
-- cannot say whether the account it names asked for it: anyone can pay with
-- someone else's email address through Paystack Inline. Activating a plan
-- supersedes the account's current subscription, and from now on it also
-- stops that subscription at Paystack, so an upgrade is no longer billed twice
-- (DECISIONS.md, 10 November 2026). Doing that for a subscription the account
-- never started would cancel a real customer's plan, so an activation is only
-- trusted when it matches a checkout started here, recorded in this table
-- before the customer is sent to Paystack.
--
-- `reference` is ours, generated before the Paystack call and passed to
-- `transaction/initialize`, so a row always exists before any payment can.
-- `consumed_at` and `subscription_code` are set by the webhook when a
-- `subscription.create` is matched to the row, so one checkout activates at
-- most one subscription.
--
-- No personal data: an account id, a plan and an amount.
--
-- Additive only: a new table and one index, nothing existing is altered.

create table qr_checkout_intents (
  id                 bigserial    primary key,
  user_id            uuid         not null references qr_users (id) on delete restrict,
  plan_id            bigint       not null references qr_plans (id),
  reference          text         not null unique,
  amount_kobo        bigint       not null,
  created_at         timestamptz  not null default now(),
  consumed_at        timestamptz,
  subscription_code  text
);

-- The webhook's lookup: an account's open checkouts for one plan.
create index qr_checkout_intents_open_idx
  on qr_checkout_intents (user_id, plan_id, created_at)
  where consumed_at is null;
