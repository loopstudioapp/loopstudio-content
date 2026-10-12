-- AskMed sales by source (USD, Apple dates) from the App Store Connect website,
-- 2026-09-19 to 2026-10-11 (earlier days had no sales). The website's "Other"
-- group is the Analytics Reports "App Store Browse" source type.
-- Never overwrites a row already saved from the Analytics Reports API.
--
-- Run once after migration 0002:
--   npx wrangler d1 execute content-dashboard --remote --file d1/seed/askmed-channel-daily-2026-09-19_10-11.sql

INSERT INTO askmed_channel_daily
  (date, app_referrer_usd, web_referrer_usd, app_store_search_usd, app_store_browse_usd, institutional_usd, unavailable_usd, other_usd, source)
VALUES
  ('2026-09-19', 16, 0, 0, 149, 0, 0, 0, 'asc_website'),
  ('2026-09-20', 314, 0, 18, 0, 0, 0, 0, 'asc_website'),
  ('2026-09-21', 93, 0, 0, 0, 0, 0, 0, 'asc_website'),
  ('2026-09-22', 339, 15, 15, 157, 0, 0, 0, 'asc_website'),
  ('2026-09-23', 1015, 0, 190, 130, 0, 0, 0, 'asc_website'),
  ('2026-09-24', 1224, 130, 173, 0, 0, 159, 0, 'asc_website'),
  ('2026-09-25', 549, 0, 518, 0, 0, 0, 0, 'asc_website'),
  ('2026-09-26', 1466, -11, 338, 15, 0, 0, 0, 'asc_website'),
  ('2026-09-27', 847, 0, 31, 0, 0, 0, 0, 'asc_website'),
  ('2026-09-28', 595, 0, 15, 130, 0, 0, 0, 'asc_website'),
  ('2026-09-29', 755, 0, 203, 189, 0, 0, 0, 'asc_website'),
  ('2026-09-30', 773, 0, 315, 0, 0, 24, 0, 'asc_website'),
  ('2026-10-01', 405, 0, 173, -151, 0, 0, 0, 'asc_website'),
  ('2026-10-02', 1401, 0, 70, 0, 0, 0, 0, 'asc_website'),
  ('2026-10-03', 1098, 0, 45, 0, 0, 0, 0, 'asc_website'),
  ('2026-10-04', 1566, 0, 56, 0, 0, 130, 0, 'asc_website'),
  ('2026-10-05', 1172, 0, 276, 0, 0, 0, 0, 'asc_website'),
  ('2026-10-06', 576, 0, 272, 18, 0, 0, 0, 'asc_website'),
  ('2026-10-07', 373, 0, 173, 0, 0, 130, 0, 'asc_website'),
  ('2026-10-08', 294, 0, 0, 0, 0, 0, 0, 'asc_website'),
  ('2026-10-09', 871, 0, 59, 0, 0, -15, 0, 'asc_website'),
  ('2026-10-10', 525, 0, 196, 136, 0, 0, 0, 'asc_website'),
  ('2026-10-11', 2538, 0, 180, 147, 0, 143, 0, 'asc_website')
ON CONFLICT(date) DO NOTHING;
