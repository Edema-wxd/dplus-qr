-- 022: hosted pages and video uploads become plan features (decided with
-- Francis, 1 November 2026).
--
-- - `hosted_pages`: Starter and up. Free makes link codes only (website,
--   Instagram, Facebook) plus static codes.
-- - `video_uploads`: Pro and up. Video is the one real storage cost; every
--   plan with hosted pages can still show a YouTube or Vimeo link.
--
-- Only making new pages and uploading new video is gated. Pages and videos
-- that already exist keep serving and stay editable on any plan, because
-- they may already be printed.

update qr_plans
   set features = features || '{"hosted_pages": true}'::jsonb
 where slug in ('starter-monthly', 'starter-annual',
                'pro-monthly', 'pro-annual',
                'business-monthly', 'business-annual');

update qr_plans
   set features = features || '{"video_uploads": true}'::jsonb
 where slug in ('pro-monthly', 'pro-annual', 'business-monthly', 'business-annual');
