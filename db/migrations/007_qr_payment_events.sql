-- 007: webhook log and idempotency guard. A replayed Paystack delivery hits the
-- unique constraint on `event_key` and changes nothing.

create table qr_payment_events (
  id            bigserial    primary key,
  event_key     text         not null unique,
  type          text         not null,
  payload       jsonb        not null,
  received_at   timestamptz  not null default now(),
  processed_at  timestamptz,
  error         text
);

create index qr_payment_events_unprocessed_idx
  on qr_payment_events (received_at)
  where processed_at is null;
