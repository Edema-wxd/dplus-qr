-- 019: public, read-only stats links ("Share stats"), Pro and Business.
--
-- One live link per code: the partial unique index allows any number of
-- revoked rows (history of who was given what) but only one with
-- `revoked_at is null`. Turning sharing off revokes; a new link revokes the
-- old one first, so a link handed out and regretted can always be killed.
--
-- The token is the whole credential, so it is long and random
-- (`src/lib/stat-shares.ts`), and it is stored as issued because the owner
-- needs to see and copy their link again later.

create table qr_stat_shares (
  id          bigserial    primary key,
  qr_id       bigint       not null references qr_codes (id) on delete cascade,
  user_id     uuid         not null references qr_users (id) on delete restrict,
  token       text         not null,
  created_at  timestamptz  not null default now(),
  revoked_at  timestamptz
);

create unique index qr_stat_shares_token_key on qr_stat_shares (token);
create unique index qr_stat_shares_live_idx on qr_stat_shares (qr_id) where revoked_at is null;

update qr_plans
   set features = features || '{"share_stats": true}'::jsonb
 where slug in ('pro-monthly', 'pro-annual', 'business-monthly', 'business-annual');
