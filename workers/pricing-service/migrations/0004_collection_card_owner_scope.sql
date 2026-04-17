ALTER TABLE collection_cards
  ADD COLUMN owner_username TEXT;

CREATE INDEX IF NOT EXISTS idx_collection_cards_owner_updated
  ON collection_cards (owner_username, updated_at DESC);
