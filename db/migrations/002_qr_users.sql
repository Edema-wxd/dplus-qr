-- 002: client accounts.
-- Deliberately separate from the dplus `admin_users` table: this platform owns
-- its own Neon project, and De Sign Plus staff auth stays untouched.

create extension if not exists pgcrypto;

create table qr_users (
  id                      uuid         primary key default gen_random_uuid(),
  email                   text         not null,
  password_hash           text         not null,
  name                    text         not null,
  role                    text         not null default 'client',
  email_verified_at       timestamptz,
  paystack_customer_code  text,
  suspended_at            timestamptz,
  created_at              timestamptz  not null default now(),
  updated_at              timestamptz  not null default now(),
  constraint qr_users_role_check check (role in ('client', 'admin'))
);

-- Case-insensitive uniqueness: emails are always stored lowercased, but the
-- index guards against a code path that forgets.
create unique index qr_users_email_key on qr_users (lower(email));

create table qr_user_tokens (
  id          bigserial    primary key,
  user_id     uuid         not null references qr_users (id) on delete cascade,
  purpose     text         not null,
  token_hash  text         not null,
  expires_at  timestamptz  not null,
  used_at     timestamptz,
  created_at  timestamptz  not null default now(),
  constraint qr_user_tokens_purpose_check check (purpose in ('verify_email', 'password_reset'))
);

-- Only the hash is stored, so lookup is by hash.
create unique index qr_user_tokens_hash_key on qr_user_tokens (token_hash);
create index qr_user_tokens_user_idx on qr_user_tokens (user_id, purpose);
