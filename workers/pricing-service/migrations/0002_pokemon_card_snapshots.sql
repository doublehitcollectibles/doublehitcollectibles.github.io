CREATE TABLE IF NOT EXISTS pokemon_card_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL,
  card_name TEXT NOT NULL,
  set_id TEXT,
  set_name TEXT,
  card_number TEXT,
  rarity TEXT,
  image_small TEXT,
  image_large TEXT,
  price_type TEXT NOT NULL,
  price_source TEXT NOT NULL,
  currency TEXT NOT NULL,
  market_price REAL,
  captured_at TEXT NOT NULL,
  tcgplayer_updated_at TEXT,
  cardmarket_updated_at TEXT,
  card_payload TEXT NOT NULL,
  price_payload TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pokemon_card_snapshots_lookup
  ON pokemon_card_snapshots (card_id, price_type, captured_at DESC);
