-- 016: custom short codes (`qriateplus.com/dplus`) are a Pro and Business
-- feature. Data only: the code is stored in `qr_codes.short_code` like any
-- other, lowercase, under the same unique index, so no schema changes.
--
-- Safe to apply before or after the code that reads it: without this flag
-- every plan simply refuses a custom code, which is the safe direction.

update qr_plans
   set features = features || '{"custom_codes": true}'::jsonb
 where slug in ('pro-monthly', 'pro-annual', 'business-monthly', 'business-annual');
