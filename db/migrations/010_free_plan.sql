-- 010: the free plan, so a signed-up account can actually serve a code.
--
-- Until Paystack checkout exists (phase 3), a real account has no row in
-- `qr_subscriptions`, and `qr_codes`' lookup treats that as "not entitled" --
-- so every code a user created through the dashboard would scan straight to
-- the paused page. Granting a free plan fixes that in DATA rather than in the
-- redirect path, which is the half of the system that must not be touched.
--
-- Limits live in this row, never in application code (see 003). Changing what
-- a free account may do is an UPDATE, not a deploy:
--
--   update qr_plans set max_codes = 10 where slug = 'free';
--
-- `max_codes` and `history_days` below are placeholders: plan names, prices,
-- code limits and the annual discount are all still open in DECISIONS.md.
--
-- `amount_kobo = 0` and a null `paystack_plan_code` are what mark this plan as
-- never billed. Phase 3 must not give it a Paystack code; it should instead
-- stop granting it and migrate existing holders onto a paid plan.

insert into qr_plans (slug, name, amount_kobo, interval, max_codes, history_days, sort_order)
values ('free', 'Free', 0, 'monthly', 5, 30, 0)
on conflict (slug) do nothing;
