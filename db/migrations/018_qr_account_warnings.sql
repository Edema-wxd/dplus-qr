-- 018: warnings staff send to an account.
--
-- Three levels: a notice, a warning, and a final warning that names a date to
-- put things right by. Passing that date changes nothing on its own: a final
-- warning that falls due is listed for staff, and suspending the account is a
-- separate action a named staff member takes (Francis, 27 Oct 2026). So
-- nothing here is ever read by the redirect path.
--
-- Erasing an account deletes its warnings, since a message about the account
-- is personal data about it. The staff audit trail keeps that one was sent.

create table qr_account_warnings (
  id               bigserial    primary key,
  user_id          uuid         not null references qr_users (id) on delete restrict,
  -- The code the warning is about, if it is about one.
  qr_id            bigint       references qr_codes (id) on delete set null,
  level            text         not null,
  message          text         not null,
  -- Final warnings only: when staff will look again.
  respond_by       timestamptz,
  issued_by        uuid         references qr_users (id) on delete set null,
  -- Null when the email did not go out; the dashboard banner still shows it.
  emailed_at       timestamptz,
  -- The owner pressed "I've read this" on their dashboard.
  acknowledged_at  timestamptz,
  -- How staff closed it: suspended the account, the owner complied, or
  -- staff withdrew it. Open while null.
  resolved_at      timestamptz,
  resolved_by      uuid         references qr_users (id) on delete set null,
  resolution       text,
  created_at       timestamptz  not null default now(),
  constraint qr_account_warnings_level_check check (level in ('notice', 'warning', 'final')),
  constraint qr_account_warnings_resolution_check
    check (resolution is null or resolution in ('suspended', 'complied', 'withdrawn')),
  constraint qr_account_warnings_resolved_check
    check ((resolved_at is null) = (resolution is null)),
  constraint qr_account_warnings_final_check
    check ((level = 'final') = (respond_by is not null))
);

-- An account's warnings, newest first: the staff page and the owner's banner.
create index qr_account_warnings_user_idx on qr_account_warnings (user_id, created_at desc);

-- Final warnings still open, by due date: the staff "due" list.
create index qr_account_warnings_due_idx
  on qr_account_warnings (respond_by)
  where level = 'final' and resolved_at is null;
