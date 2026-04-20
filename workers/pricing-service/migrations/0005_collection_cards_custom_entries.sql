ALTER TABLE collection_cards
  ADD COLUMN source TEXT NOT NULL DEFAULT 'api';

ALTER TABLE collection_cards
  ADD COLUMN game TEXT;

ALTER TABLE collection_cards
  ADD COLUMN category TEXT;

ALTER TABLE collection_cards
  ADD COLUMN series TEXT;

ALTER TABLE collection_cards
  ADD COLUMN variant TEXT;

ALTER TABLE collection_cards
  ADD COLUMN item_number TEXT;

ALTER TABLE collection_cards
  ADD COLUMN image TEXT;

ALTER TABLE collection_cards
  ADD COLUMN artist TEXT;

ALTER TABLE collection_cards
  ADD COLUMN description TEXT;

ALTER TABLE collection_cards
  ADD COLUMN currency TEXT;

ALTER TABLE collection_cards
  ADD COLUMN current_price REAL;

ALTER TABLE collection_cards
  ADD COLUMN price_source TEXT;

CREATE INDEX IF NOT EXISTS idx_collection_cards_source_updated
  ON collection_cards (source, updated_at DESC);
