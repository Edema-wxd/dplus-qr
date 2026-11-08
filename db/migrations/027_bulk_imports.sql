-- 027: bulk creation, a batch of codes made from one spreadsheet.
--
-- One row per batch, and a join table naming the codes it made, so the
-- batch's page can list them and offer them as one zip. A join table rather
-- than a column on qr_codes, so the table every scan reads is not altered.
--
-- Counts only. The uploaded file and the rows that failed are never stored:
-- they are the customer's own data, shown back once and then gone.

create table qr_bulk_imports (
  id               bigserial    primary key,
  user_id          uuid         not null references qr_users (id) on delete restrict,
  source           text         not null check (source in ('csv', 'paste')),
  -- Data rows in the file, header excluded.
  rows_total       integer      not null,
  -- Rows refused on their own merits (a bad link, a name too long).
  rows_invalid     integer      not null default 0,
  -- Valid rows left out because the plan had no code slots left for them.
  rows_over_limit  integer      not null default 0,
  rows_created     integer      not null,
  created_at       timestamptz  not null default now()
);

create index qr_bulk_imports_user_idx on qr_bulk_imports (user_id, created_at desc);

create table qr_bulk_import_codes (
  import_id  bigint  not null references qr_bulk_imports (id) on delete cascade,
  qr_id      bigint  not null references qr_codes (id) on delete cascade,
  -- The spreadsheet row the code came from, as the owner's spreadsheet
  -- numbers it (the header is row 1), so the batch page lists codes in the
  -- order they were written.
  row_number integer not null,
  primary key (import_id, qr_id)
);
