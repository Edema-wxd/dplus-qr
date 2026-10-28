-- 018: operating system and city join the daily rollup, and the detailed
-- analytics they feed become a Starter-and-up feature.
--
-- Same reason 012 added country and device: retention deletes raw `qr_scans`
-- rows once they are older than the owner's plan allows, and any breakdown not
-- in `qr_scan_daily` by then is gone for good. OS has been recorded on every
-- scan since 006 but never rolled up; city starts being recorded with this
-- change (`x-vercel-ip-city`).
--
-- 'unknown' rather than NULL, as in 012, because these are key columns.

alter table qr_scan_daily add column os   text not null default 'unknown';
alter table qr_scan_daily add column city text not null default 'unknown';

alter table qr_scan_daily drop constraint qr_scan_daily_pkey;
alter table qr_scan_daily add primary key (qr_id, day, country, device_type, os, city);

-- Every existing rollup row now reads os = city = 'unknown'. Where the raw
-- rows for that code and day are all still here, rebuild the day from them so
-- its OS split is not lost. "All still here" is checked, not assumed: a day
-- is rebuilt only when its raw count equals what was rolled up, so a day that
-- retention has partly pruned keeps the totals it has rather than shrinking.
create temp table rebuild_days on commit drop as
  select r.qr_id, r.day
  from (
    select qr_id, (scanned_at at time zone 'UTC')::date as day, count(*) as scans
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

delete from qr_scan_daily d
using rebuild_days b
where d.qr_id = b.qr_id and d.day = b.day;

insert into qr_scan_daily (qr_id, day, country, device_type, os, city, scans, unique_scans)
select
  s.qr_id,
  (s.scanned_at at time zone 'UTC')::date,
  coalesce(nullif(s.country, ''), 'unknown'),
  coalesce(nullif(s.device_type, ''), 'unknown'),
  coalesce(nullif(s.os, ''), 'unknown'),
  coalesce(nullif(s.city, ''), 'unknown'),
  count(*),
  count(distinct s.ip_hash)
from qr_scans s
join rebuild_days b
  on b.qr_id = s.qr_id and b.day = (s.scanned_at at time zone 'UTC')::date
where not s.is_bot
group by 1, 2, 3, 4, 5, 6;

-- Unique scans, operating systems, cities and the trend against the previous
-- period: Starter, Pro and Business. Free keeps the daily chart, countries
-- and devices it already had.
update qr_plans
   set features = features || '{"insights": true}'::jsonb
 where slug in ('starter-monthly', 'starter-annual',
                'pro-monthly', 'pro-annual',
                'business-monthly', 'business-annual');
