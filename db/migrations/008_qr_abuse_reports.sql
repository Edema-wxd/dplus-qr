-- 008: fed by the "Report this link" form on the status pages.

create table qr_abuse_reports (
  id              bigserial    primary key,
  qr_id           bigint       references qr_codes (id) on delete set null,
  reported_code   text         not null,
  reporter_email  text,
  reason          text         not null,
  status          text         not null default 'open',
  created_at      timestamptz  not null default now(),
  constraint qr_abuse_reports_status_check check (status in ('open', 'actioned', 'dismissed'))
);

create index qr_abuse_reports_open_idx
  on qr_abuse_reports (created_at desc)
  where status = 'open';

-- `reported_code` is kept as plain text as well as the FK, so a report still
-- makes sense if the code row is ever removed.
