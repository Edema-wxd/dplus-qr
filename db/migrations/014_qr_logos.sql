-- 014: each account's logo library, and the logo a code is drawn with.
--
-- A logo is uploaded once and kept, so the next code an owner makes can reuse
-- it without uploading it again. The files themselves live in UploadThing; this
-- table holds the account's record of them.
--
-- Supersedes `qr_codes.logo_key` from 005, which was meant for a key in the Neon
-- `assets` bucket. Nothing ever wrote to it, and it stays unused rather than
-- being dropped, because migrations here are additive only.

create table qr_logos (
  id           bigserial    primary key,
  user_id      uuid         not null references qr_users (id) on delete restrict,
  -- UploadThing's own key for the file. Unique so a repeated upload callback
  -- lands on the row it already made instead of adding a duplicate.
  file_key     text         not null,
  url          text         not null,
  name         text         not null,
  mime_type    text         not null,
  size_bytes   integer      not null,
  created_at   timestamptz  not null default now(),
  -- Removing a logo from the library hides it from the picker. It does not
  -- delete the row or the file: a code drawn with it still downloads with it.
  archived_at  timestamptz
);

create unique index qr_logos_file_key_key on qr_logos (file_key);

-- The picker: an account's live logos, newest first.
create index qr_logos_user_idx on qr_logos (user_id, created_at desc)
  where archived_at is null;

-- `restrict`, like every other reference in this schema: a logo a code is drawn
-- with is never deleted out from under it. Nullable, because most codes have
-- no logo. Never read by the redirect path.
alter table qr_codes add column logo_id bigint references qr_logos (id) on delete restrict;
