CREATE TABLE IF NOT EXISTS visitor_identities (
  site_key TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (site_key, visitor_id)
);

CREATE TABLE IF NOT EXISTS visitor_sessions (
  visit_id TEXT PRIMARY KEY,
  site_key TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_visitor_sessions_site_active_last_seen
  ON visitor_sessions (site_key, active, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_visitor_sessions_site_visitor
  ON visitor_sessions (site_key, visitor_id);
