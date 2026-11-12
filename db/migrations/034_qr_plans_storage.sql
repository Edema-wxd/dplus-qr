-- 034: how much page-file storage each plan allows.
--
-- Security audit M4 (10 November 2026): page files (PDFs, photos, video,
-- audio) had a size limit per file and per request and none per account, so
-- one account could store as much as it cared to script, public at once on
-- the company's UploadThing bill. From now on an upload that would take an
-- account past `features.storage_mb` is refused (DECISIONS.md, 11 November
-- 2026). Staff change the values from /admin/plans; a plan without one gets
-- 100 MB in code (`DEFAULT_STORAGE_MB`), never unlimited.
--
-- Starting values, set where a plan has none so a value staff already chose is
-- never overwritten:
--   free      25 MB  Free makes no pages; this is for an account that kept
--                    pages from a paid plan and still edits them.
--   starter  250 MB  pages, no video
--   pro     2048 MB  video from here (64 MB a file)
--   business 10240 MB
--
-- Additive only: a key added to `features` on existing rows.

update qr_plans
   set features = features || '{"storage_mb": 25}'::jsonb
 where slug = 'free' and not (features ? 'storage_mb');

update qr_plans
   set features = features || '{"storage_mb": 250}'::jsonb
 where slug in ('starter-monthly', 'starter-annual') and not (features ? 'storage_mb');

update qr_plans
   set features = features || '{"storage_mb": 2048}'::jsonb
 where slug in ('pro-monthly', 'pro-annual') and not (features ? 'storage_mb');

update qr_plans
   set features = features || '{"storage_mb": 10240}'::jsonb
 where slug in ('business-monthly', 'business-annual') and not (features ? 'storage_mb');
