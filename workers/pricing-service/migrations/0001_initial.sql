CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_query TEXT NOT NULL UNIQUE,
  display_query TEXT NOT NULL,
  card_number TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_query TEXT NOT NULL,
  display_query TEXT NOT NULL,
  provider TEXT NOT NULL,
  source_url TEXT NOT NULL,
  market_price REAL NOT NULL,
  average_price REAL NOT NULL,
  median_price REAL NOT NULL,
  trimmed_mean_price REAL NOT NULL,
  min_price REAL NOT NULL,
  max_price REAL NOT NULL,
  sample_size INTEGER NOT NULL,
  currency TEXT NOT NULL,
  sold_from TEXT,
  sold_to TEXT,
  refreshed_at TEXT NOT NULL,
  raw_payload TEXT,
  FOREIGN KEY (normalized_query) REFERENCES cards(normalized_query)
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_query_refreshed
  ON price_snapshots (normalized_query, refreshed_at DESC);

CREATE TABLE IF NOT EXISTS sold_comps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL,
  provider_item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  listing_url TEXT NOT NULL,
  sale_price REAL NOT NULL,
  shipping_price REAL NOT NULL,
  total_price REAL NOT NULL,
  currency TEXT NOT NULL,
  sold_at TEXT,
  condition_bucket TEXT NOT NULL,
  raw_payload TEXT NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES price_snapshots(id),
  UNIQUE (snapshot_id, provider_item_id)
);

CREATE INDEX IF NOT EXISTS idx_sold_comps_snapshot_id
  ON sold_comps (snapshot_id);

CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  normalized_query TEXT NOT NULL UNIQUE,
  refresh_every_hours INTEGER NOT NULL DEFAULT 4,
  active INTEGER NOT NULL DEFAULT 1,
  next_refresh_at TEXT NOT NULL,
  last_refreshed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_watchlist_due
  ON watchlist (active, next_refresh_at);

CREATE TABLE IF NOT EXISTS source_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_query TEXT NOT NULL,
  provider TEXT NOT NULL,
  stage TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_source_errors_query_created
  ON source_errors (normalized_query, created_at DESC);
