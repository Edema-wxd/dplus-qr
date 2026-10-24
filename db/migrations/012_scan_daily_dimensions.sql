-- 012: give the daily rollup the dimensions the dashboard actually asks for,
-- so raw scan rows can be pruned without destroying history.
--
-- `qr_scan_daily` was created in 006 at a grain of (qr_id, day) with no
-- country and no device. That grain can answer "how many scans on the 4th"
-- and nothing else, so every breakdown had to read `qr_scans` directly -- and
-- `qr_scans` is the table retention deletes from. Rolling up without the
-- dimensions would mean pruning raw rows and silently losing the answer to
-- every question except the daily total.
--
-- Safe to change the key rather than supersede the table: 006 has run, but
-- nothing has ever written to it (verified empty, and the repo had no rollup
-- writer until this migration's companion code), so there are no rows to
-- migrate and no reader to break.
--
-- 'unknown' rather than NULL, because the four columns are a primary key and
-- a key cannot hold NULL. Geo is a deliberate stub on hosts that supply no
-- country header, and an unparsed user agent has no device, so "we did not
-- learn it" is a real and common value that has to be groupable.

alter table qr_scan_daily add column country     text not null default 'unknown';
alter table qr_scan_daily add column device_type text not null default 'unknown';

alter table qr_scan_daily drop constraint qr_scan_daily_pkey;
alter table qr_scan_daily add primary key (qr_id, day, country, device_type);

-- The dashboard always scopes by code and date range before it groups, so the
-- range scan is the one that has to be cheap.
create index qr_scan_daily_qr_day_idx on qr_scan_daily (qr_id, day desc);

-- `unique_scans` now counts distinct visitors *within* this country and device
-- on this day. It is deliberately NOT summable across rows -- adding two
-- approximate distinct counts does not give the distinct count of the union --
-- so a day-level unique figure needs its own aggregate and must never be
-- produced by summing this column.
comment on column qr_scan_daily.unique_scans is
  'Distinct ip_hash within this (qr_id, day, country, device_type). Not summable across rows.';
