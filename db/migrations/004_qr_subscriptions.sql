-- 004: one active subscription row per user. Paystack webhooks are the only
-- writer of `status` -- nothing in the browser flow may set it.

create table qr_subscriptions (
  id                           bigserial    primary key,
  user_id                      uuid         not null references qr_users (id) on delete cascade,
  plan_id                      bigint       not null references qr_plans (id),
  paystack_subscription_code   text         unique,
  paystack_email_token         text,
  status                       text         not null,
  current_period_end           timestamptz,
  grace_until                  timestamptz,
  cancel_at_period_end         boolean      not null default false,
  created_at                   timestamptz  not null default now(),
  updated_at                   timestamptz  not null default now(),
  constraint qr_subscriptions_status_check
    check (status in ('active', 'past_due', 'cancelled', 'incomplete'))
);

-- At most one live subscription per user; lapsed rows are kept for history.
create unique index qr_subscriptions_active_user_idx
  on qr_subscriptions (user_id)
  where status in ('active', 'past_due');

create index qr_subscriptions_grace_idx
  on qr_subscriptions (grace_until)
  where status = 'past_due';
