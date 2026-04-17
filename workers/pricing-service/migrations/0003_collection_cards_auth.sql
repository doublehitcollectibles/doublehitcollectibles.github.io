CREATE TABLE IF NOT EXISTS collection_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL,
  label TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  purchase_price REAL,
  purchase_date TEXT,
  price_type TEXT,
  condition TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_collection_cards_card_id
  ON collection_cards (card_id, updated_at DESC);
