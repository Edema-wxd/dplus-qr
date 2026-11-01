-- 023: editable page content, starting with the pricing page.
--
-- One JSON document per key, edited from the staff admin
-- (`/admin/pricing`) and validated by `src/lib/site-content.ts` on the way in
-- and on the way out. A missing row means "use the defaults in code", so this
-- table can be empty and every page still renders.
--
-- The billing points in the `pricing` document are also the matching clauses
-- of the Terms, so the two pages read one copy and cannot drift apart.

create table site_content (
  key         text         primary key,
  value       jsonb        not null,
  updated_at  timestamptz  not null default now(),
  updated_by  uuid         references qr_users (id) on delete set null
);
