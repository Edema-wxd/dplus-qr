-- 001: migration bookkeeping.
-- Applied by scripts/migrate.ts before anything else.

create table if not exists schema_migrations (
  version     text        primary key,
  applied_at  timestamptz not null default now(),
  checksum    text        not null
);
