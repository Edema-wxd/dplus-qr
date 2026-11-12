-- 035: a log of the nightly backups.
--
-- Written by the backup job (.github/workflows/backup.yml, via
-- scripts/backup/record.sh), one row per run, ok or failed. The app only
-- reads it: a daily check emails staff when no good backup has landed in
-- 30 hours, and the admin overview and weekly summary show the last one.
-- The backups themselves live encrypted outside the database; this holds
-- no personal data, only sizes, counts and a link to the run.

create table qr_backups (
  id              bigserial    primary key,
  created_at      timestamptz  not null default now(),
  status          text         not null,
  bytes           bigint,
  tables          integer,
  row_count       bigint,
  schema_version  text,
  run_url         text,
  detail          text,
  constraint qr_backups_status_check check (status in ('ok', 'failed'))
);

create index qr_backups_time_idx on qr_backups (created_at desc);
