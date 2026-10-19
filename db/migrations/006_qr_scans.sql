-- 006: scan events and their daily rollup.
-- Raw rows are pruned per the owner's plan `history_days`; the rollup is kept
-- for the life of the account, and the dashboard reads only the rollup.

create table qr_scans (
  id           bigserial    primary key,
  qr_id        bigint       not null references qr_codes (id) on delete cascade,
  scanned_at   timestamptz  not null default now(),
  country      text,
  city         text,
  device_type  text,
  os           text,
  browser      text,
  ip_hash      text,
  is_bot       boolean      not null default false
);

-- Analytics ranges and retention deletes.
create index qr_scans_qr_time_idx on qr_scans (qr_id, scanned_at desc);

-- Retention sweep scans by time across all codes.
create index qr_scans_time_idx on qr_scans (scanned_at);

create table qr_scan_daily (
  qr_id         bigint   not null references qr_codes (id) on delete cascade,
  day           date     not null,
  scans         integer  not null default 0,
  unique_scans  integer  not null default 0,
  primary key (qr_id, day)
);
