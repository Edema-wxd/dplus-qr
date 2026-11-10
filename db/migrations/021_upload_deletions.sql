-- 021: UploadThing files waiting to be deleted.
--
-- A file's database row and the file itself live in two systems, so deleting
-- both cannot be one transaction. Rows are deleted first, inside the database
-- transaction that decides they should go, and each file's key is queued here
-- in the same transaction. The upload clean-up (`src/lib/upload-cleanup.ts`)
-- then deletes queued files from UploadThing and marks them done, retrying on
-- later runs if UploadThing refuses. Without this, a failed delete after the
-- row was gone left a file nobody had a record of.

create table qr_upload_deletions (
  file_key    text         primary key,
  reason      text         not null,
  queued_at   timestamptz  not null default now(),
  attempts    integer      not null default 0,
  last_error  text,
  deleted_at  timestamptz
);

create index qr_upload_deletions_pending_idx on qr_upload_deletions (queued_at)
  where deleted_at is null;
