-- 026: one unique-visitor count per code per day.
--
-- `qr_scan_daily.unique_scans` counts distinct visitors within one
-- (country, device, os, city) group, and 012 says plainly that it is not
-- summable across rows. The chart summed it anyway, so a visitor who showed
-- up in two groups on one day (a phone that changed network, say) counted
-- twice. A day-level figure needs its own aggregate, and once retention has
-- pruned the raw rows it cannot be rebuilt, so it is kept here beside the
-- rollup, written by the same nightly statement.
--
-- Still the daily-rotating hash: the same phone on two days counts on both,
-- which is what "unique scans" has always meant on the code page.
--
-- A new table rather than a column on qr_scan_daily, because that table's
-- key is the grouping and a day total does not belong to any one group.
-- Nothing on the redirect path reads or writes it.

create table qr_scan_daily_visitors (
  qr_id         bigint   not null references qr_codes (id) on delete cascade,
  day           date     not null,
  unique_scans  integer  not null default 0,
  primary key (qr_id, day)
);

-- Back-fill from raw rows, only for days whose raw rows are all still here:
-- the same "raw count equals rolled-up count" test 018 used. A day retention
-- has partly pruned gets no row, and the reader falls back to the old summed
-- figure for it rather than undercounting from what is left.
insert into qr_scan_daily_visitors (qr_id, day, unique_scans)
select r.qr_id, r.day, r.unique_scans
from (
  select qr_id,
         (scanned_at at time zone 'UTC')::date as day,
         count(*)                              as scans,
         count(distinct ip_hash)               as unique_scans
  from qr_scans
  where not is_bot
  group by 1, 2
) r
join (
  select qr_id, day, sum(scans) as scans
  from qr_scan_daily
  group by 1, 2
) d on d.qr_id = r.qr_id and d.day = r.day
where r.scans = d.scans;
