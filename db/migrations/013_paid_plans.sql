-- 013: the paid plans, from the pricing table confirmed by Francis on
-- 24 October 2026. Starter monthly matches PRICE_FROM_NGN in src/lib/brand.ts,
-- which is the single price anchor the landing page is allowed to show.
--
-- Amounts are kobo, because that is what Paystack charges in and migration 003
-- stores. Naira never appears as a float anywhere in this codebase.
--
--   Starter   NGN  4,000/mo     NGN  40,000/yr    10 codes    90 days
--   Pro       NGN 10,000/mo     NGN 100,000/yr    50 codes    12 months
--   Business  NGN 25,000/mo     NGN 250,000/yr   250 codes    24 months
--
-- The annual price is ten months for twelve -- two months free, 16.7% off --
-- so it is stored as its own row rather than computed. A discount in code
-- would be a second place for the price to live, and the two would drift.
--
-- `paystack_plan_code` is deliberately NULL. Plans are created in the Paystack
-- dashboard and the code comes back from them, so inventing one here would
-- produce a plan that cannot be charged. `listPurchasablePlans()` requires a
-- non-null code, which means these rows are invisible to checkout until
-- `npm run plans:sync` attaches them -- the safe way round.
--
-- `sort_order` ascends with price so the pricing page needs no opinion of its
-- own about ordering.

insert into qr_plans
  (slug, name, amount_kobo, interval, max_codes, history_days, grace_days,
   features, sort_order)
values
  ('starter-monthly',  'Starter',    400000, 'monthly',   10,  90, 7,
   '{"analytics":"basic","csv_export":false,"support":"email"}'::jsonb, 10),

  ('starter-annual',   'Starter',   4000000, 'annually',  10,  90, 7,
   '{"analytics":"basic","csv_export":false,"support":"email","months_free":2}'::jsonb, 11),

  ('pro-monthly',      'Pro',      1000000, 'monthly',   50, 365, 7,
   '{"analytics":"trends","csv_export":true,"support":"whatsapp_priority"}'::jsonb, 20),

  ('pro-annual',       'Pro',     10000000, 'annually',  50, 365, 7,
   '{"analytics":"trends","csv_export":true,"support":"whatsapp_priority","months_free":2}'::jsonb, 21),

  ('business-monthly', 'Business', 2500000, 'monthly',  250, 730, 7,
   '{"analytics":"trends","csv_export":true,"support":"priority","bulk_creation":true,"team_seats":true}'::jsonb, 30),

  ('business-annual',  'Business',25000000, 'annually', 250, 730, 7,
   '{"analytics":"trends","csv_export":true,"support":"priority","bulk_creation":true,"team_seats":true,"months_free":2}'::jsonb, 31)

on conflict (slug) do nothing;

-- The seed fixture is not a plan anyone may buy. Retired rather than deleted:
-- `qr_subscriptions.plan_id` references it, and seeded test accounts still do.
update qr_plans set is_active = false where slug = 'seed-test';
