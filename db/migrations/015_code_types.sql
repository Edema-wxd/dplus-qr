-- 015: what a dynamic code is, beyond a link.
--
-- Until now every code was a link: `destination_url` is where a scan goes.
-- Some code types are still exactly that (a website, an Instagram profile, a
-- Facebook page) and only record their `kind` so the dashboard can say so.
-- The rest carry content we host -- a menu, a profile card, a PDF -- and their
-- `destination_url` is our own page, the relative path `/p/{short_code}`.
--
-- The redirect path is unchanged by any of this. It still reads one
-- `destination_url` and answers 302, and a relative Location resolves against
-- the host the scanner used, for the same reason the status pages use one. It
-- never reads `kind` or `content`; the hosted page reads those itself.

alter table qr_codes add column kind text not null default 'url';
alter table qr_codes add column content jsonb;

-- Kept in step with `DYNAMIC_TYPES` in src/lib/qr-types.ts, and a test reads
-- this file to check the two agree. A new type is a new migration that drops
-- and re-adds this constraint with the longer list.
alter table qr_codes add constraint qr_codes_kind_check check (kind in (
  'url', 'instagram', 'facebook',
  'pdf', 'images', 'video', 'profile', 'links', 'social', 'app', 'mp3',
  'business', 'menu', 'feedback', 'event', 'coupon', 'playlist', 'barcode'
));

-- Files a hosted page shows: PDFs, photos, video, audio. Like `qr_logos`, the
-- bytes live in UploadThing and this is the account's record of them -- which
-- is also what lets the server refuse a page that names a file the account
-- does not own.
create table qr_files (
  id          bigserial    primary key,
  user_id     uuid         not null references qr_users (id) on delete restrict,
  file_key    text         not null,
  url         text         not null,
  name        text         not null,
  mime_type   text         not null,
  size_bytes  bigint       not null,
  created_at  timestamptz  not null default now()
);

create unique index qr_files_file_key_key on qr_files (file_key);
create index qr_files_user_idx on qr_files (user_id, created_at desc);

-- Answers to a feedback code. Written by the public page with no session, so
-- the insert is rate limited per visitor in the action that writes it. No IP,
-- hashed or otherwise, is stored: the owner needs the rating, not the rater.
create table qr_feedback (
  id          bigserial    primary key,
  qr_id       bigint       not null references qr_codes (id) on delete restrict,
  rating      smallint     not null,
  comment     text,
  created_at  timestamptz  not null default now(),
  constraint qr_feedback_rating_check check (rating between 1 and 5)
);

create index qr_feedback_qr_idx on qr_feedback (qr_id, created_at desc);
