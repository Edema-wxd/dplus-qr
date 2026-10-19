-- 003: subscription plans. Limits live here, never in application code, so a
-- plan change is a row update rather than a deploy.

create table qr_plans (
  id                   bigserial    primary key,
  slug                 text         not null unique,
  name                 text         not null,
  paystack_plan_code   text         unique,
  amount_kobo          bigint       not null,
  interval             text         not null,
  max_codes            integer      not null,
  history_days         integer      not null,
  features             jsonb        not null default '{}'::jsonb,
  is_active            boolean      not null default true,
  sort_order           integer      not null default 0,
  created_at           timestamptz  not null default now(),
  constraint qr_plans_interval_check check (interval in ('monthly', 'annually'))
);
