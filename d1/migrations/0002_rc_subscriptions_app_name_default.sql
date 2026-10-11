-- Live Supabase column: rc_subscriptions.app_name text default 'Roomy AI'.
-- SQLite cannot change a column default in place, so rebuild the table.
CREATE TABLE rc_subscriptions_new (
  id TEXT PRIMARY KEY NOT NULL,
  app_user_id TEXT NOT NULL,
  country TEXT,
  store TEXT DEFAULT 'app_store',
  product_id TEXT,
  status TEXT NOT NULL,
  auto_renewal TEXT,
  environment TEXT DEFAULT 'production',
  purchased_at TEXT,
  expires_at TEXT,
  revenue_gross REAL DEFAULT 0,
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  app_name TEXT DEFAULT 'Roomy AI'
);
INSERT INTO rc_subscriptions_new SELECT id, app_user_id, country, store, product_id, status, auto_renewal,
  environment, purchased_at, expires_at, revenue_gross, updated_at, created_at, app_name FROM rc_subscriptions;
DROP TABLE rc_subscriptions;
ALTER TABLE rc_subscriptions_new RENAME TO rc_subscriptions;
CREATE INDEX IF NOT EXISTS idx_rc_subs_status ON rc_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_rc_subs_env ON rc_subscriptions(environment);
CREATE INDEX IF NOT EXISTS idx_rc_subs_env_purchased ON rc_subscriptions(environment, purchased_at);
CREATE INDEX IF NOT EXISTS idx_rc_subs_user ON rc_subscriptions(app_user_id);
