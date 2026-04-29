CREATE TABLE IF NOT EXISTS story_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_username TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  data_url TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  alt TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS story_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_username TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  body_markdown TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  hero_media_id INTEGER REFERENCES story_media(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_story_articles_status_published
  ON story_articles (status, published_at DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_story_articles_owner_updated
  ON story_articles (owner_username, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_story_media_owner_created
  ON story_media (owner_username, created_at DESC);
