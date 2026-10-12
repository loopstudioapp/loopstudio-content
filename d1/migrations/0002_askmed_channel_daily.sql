-- AskMed sales by App Store source type, per Apple report date (USD), for the
-- owner dashboard's revenue split (lib/appstore/channels.ts).
-- Meta = App Referrer + Web Referrer; Organic = App Store Search + App Store
-- Browse (the App Store Connect website calls Browse "Other"); Institutional,
-- Unavailable and any other source type are shared by that day's Meta:Organic ratio.
-- Values can be negative (refunds).
--
-- Apply: npx wrangler d1 migrations apply content-dashboard --remote

CREATE TABLE IF NOT EXISTS askmed_channel_daily (
  date TEXT PRIMARY KEY NOT NULL,
  app_referrer_usd REAL NOT NULL DEFAULT 0,
  web_referrer_usd REAL NOT NULL DEFAULT 0,
  app_store_search_usd REAL NOT NULL DEFAULT 0,
  app_store_browse_usd REAL NOT NULL DEFAULT 0,
  institutional_usd REAL NOT NULL DEFAULT 0,
  unavailable_usd REAL NOT NULL DEFAULT 0,
  other_usd REAL NOT NULL DEFAULT 0,
  -- analytics_report (App Store Connect API) or asc_website (one-time seed)
  source TEXT NOT NULL DEFAULT 'analytics_report',
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now') || '000Z')
);

-- Analytics Reports instances already downloaded, so each file is read once.
CREATE TABLE IF NOT EXISTS askmed_channel_instances (
  id TEXT PRIMARY KEY NOT NULL,
  request_kind TEXT NOT NULL,
  processing_date TEXT,
  dates TEXT,
  fetched_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now') || '000Z')
);
