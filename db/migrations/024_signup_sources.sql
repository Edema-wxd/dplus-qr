-- 024: where an account came from, when we know.
--
-- Every hosted page ends with "Powered by QRiate+", linking to sign-up with
-- the page's code. An account created from that link gets one row here,
-- naming the code whose page sent it, so staff can see how many customers
-- the footer brings in and whose pages bring them.
--
-- Nothing personal: the account's own id and a code that was already public.
-- No cookie is involved. The code rides in the sign-up link and the form, so
-- only a sign-up made on that visit is credited, which keeps the privacy
-- policy's "one cookie, only when you sign in" true.
--
-- A separate table rather than columns on qr_users, so the profile row stays
-- about the account and most accounts, which arrive any other way, have no row.

create table qr_signup_sources (
  user_id      uuid         primary key references qr_users (id) on delete cascade,
  source       text         not null check (source in ('hosted_page')),
  ref_code_id  bigint       references qr_codes (id) on delete set null,
  created_at   timestamptz  not null default now()
);

create index qr_signup_sources_created_idx on qr_signup_sources (created_at);
create index qr_signup_sources_ref_code_idx on qr_signup_sources (ref_code_id);
