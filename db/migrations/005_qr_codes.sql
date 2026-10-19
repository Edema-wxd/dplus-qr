-- 005: the codes themselves. This table is on the redirect path, so it stays
-- narrow and its lookup index is the only one that must never be dropped.

create table qr_codes (
  id               bigserial    primary key,
  user_id          uuid         not null references qr_users (id) on delete restrict,
  short_code       text         not null,
  name             text         not null,
  destination_url  text         not null,
  status           text         not null default 'active',
  style            jsonb        not null default '{}'::jsonb,
  logo_key         text,
  blocked_reason   text,
  created_at       timestamptz  not null default now(),
  updated_at       timestamptz  not null default now(),
  constraint qr_codes_status_check check (status in ('active', 'paused', 'blocked'))
);

-- The one lookup on the redirect path.
create unique index qr_codes_short_code_key on qr_codes (short_code);

-- Dashboard listing.
create index qr_codes_user_idx on qr_codes (user_id, created_at desc);

-- `on delete restrict` above is deliberate: deleting a user must never silently
-- break a printed code. Accounts are suspended, codes are paused -- never dropped.

create table qr_destination_history (
  id          bigserial    primary key,
  qr_id       bigint       not null references qr_codes (id) on delete cascade,
  old_url     text,
  new_url     text         not null,
  changed_by  uuid         references qr_users (id) on delete set null,
  changed_at  timestamptz  not null default now()
);

create index qr_destination_history_qr_idx on qr_destination_history (qr_id, changed_at desc);
