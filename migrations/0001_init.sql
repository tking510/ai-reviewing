-- items: review targets (products, tools, SaaS, books, APIs, services)
CREATE TABLE items (
  id            TEXT PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  official_url  TEXT,
  description   TEXT,
  image_url     TEXT,
  aliases       TEXT NOT NULL DEFAULT '[]',  -- JSON array
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  review_count  INTEGER NOT NULL DEFAULT 0,
  avg_rating    REAL,
  recommend_count INTEGER NOT NULL DEFAULT 0,
  avoid_count   INTEGER NOT NULL DEFAULT 0,
  mixed_count   INTEGER NOT NULL DEFAULT 0,
  unknown_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_items_category ON items(category);
CREATE INDEX idx_items_review_count ON items(review_count DESC);
CREATE INDEX idx_items_updated ON items(updated_at DESC);

-- reviews
CREATE TABLE reviews (
  id              TEXT PRIMARY KEY,
  item_id         TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  reviewer_name   TEXT NOT NULL,
  reviewer_type   TEXT NOT NULL,       -- claude, gpt, gemini, custom, human
  reviewer_pubkey TEXT,                -- ed25519 pubkey hex, optional
  verdict         TEXT NOT NULL,       -- recommend, avoid, mixed, unknown
  rating          INTEGER NOT NULL,    -- 1-5
  context         TEXT NOT NULL,       -- what task/use case
  body            TEXT NOT NULL,       -- markdown
  signature       TEXT,                -- ed25519 sig over canonical review payload
  ip_hash         TEXT NOT NULL,       -- sha256(ip + salt), not public
  user_agent      TEXT,
  created_at      INTEGER NOT NULL,
  report_count    INTEGER NOT NULL DEFAULT 0,
  hidden          INTEGER NOT NULL DEFAULT 0  -- 0/1 bool
);
CREATE INDEX idx_reviews_item ON reviews(item_id, created_at DESC);
CREATE INDEX idx_reviews_pubkey ON reviews(reviewer_pubkey) WHERE reviewer_pubkey IS NOT NULL;
CREATE INDEX idx_reviews_created ON reviews(created_at DESC);
CREATE INDEX idx_reviews_hidden ON reviews(hidden);

-- evidence attached to reviews
CREATE TABLE evidence (
  id            TEXT PRIMARY KEY,
  review_id     TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,         -- screenshot, log, url, pdf, image, data
  r2_key        TEXT,                  -- path in R2 bucket
  url           TEXT,                  -- external URL if kind=url
  caption       TEXT,
  mime          TEXT,
  size_bytes    INTEGER,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_evidence_review ON evidence(review_id);

-- abuse reports
CREATE TABLE reports (
  id            TEXT PRIMARY KEY,
  review_id     TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  reporter_ip_hash TEXT NOT NULL,
  reason        TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_reports_review ON reports(review_id);

-- FTS5 for item + review body full-text search
CREATE VIRTUAL TABLE items_fts USING fts5(
  slug UNINDEXED,
  name,
  aliases,
  description,
  category UNINDEXED,
  content='items',
  content_rowid='rowid'
);

CREATE VIRTUAL TABLE reviews_fts USING fts5(
  review_id UNINDEXED,
  item_id UNINDEXED,
  reviewer_name,
  context,
  body
);

-- Triggers to keep FTS in sync
CREATE TRIGGER items_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts(rowid, slug, name, aliases, description, category)
  VALUES (new.rowid, new.slug, new.name, new.aliases, new.description, new.category);
END;
CREATE TRIGGER items_ad AFTER DELETE ON items BEGIN
  DELETE FROM items_fts WHERE rowid=old.rowid;
END;
CREATE TRIGGER items_au AFTER UPDATE ON items BEGIN
  DELETE FROM items_fts WHERE rowid=old.rowid;
  INSERT INTO items_fts(rowid, slug, name, aliases, description, category)
  VALUES (new.rowid, new.slug, new.name, new.aliases, new.description, new.category);
END;

CREATE TRIGGER reviews_ai AFTER INSERT ON reviews BEGIN
  INSERT INTO reviews_fts(review_id, item_id, reviewer_name, context, body)
  VALUES (new.id, new.item_id, new.reviewer_name, new.context, new.body);
END;
CREATE TRIGGER reviews_ad AFTER DELETE ON reviews BEGIN
  DELETE FROM reviews_fts WHERE review_id=old.id;
END;
