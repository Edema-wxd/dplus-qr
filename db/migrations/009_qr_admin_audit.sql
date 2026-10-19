-- 009: every admin action, for the audit trail the compliance pages promise.

create table qr_admin_audit (
  id          bigserial    primary key,
  actor_id    uuid         references qr_users (id) on delete set null,
  action      text         not null,
  target_type text         not null,
  target_id   text,
  detail      jsonb        not null default '{}'::jsonb,
  created_at  timestamptz  not null default now()
);

create index qr_admin_audit_time_idx on qr_admin_audit (created_at desc);
