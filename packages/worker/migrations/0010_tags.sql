-- 0010_tags.sql
-- Host tagging: tags table + host_tags junction table
-- Applied via: wrangler d1 execute bat-db --file=migrations/0010_tags.sql
-- Spec: docs/11-host-tags.md § Data Model

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color      INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Junction table for host ↔ tag many-to-many
CREATE TABLE IF NOT EXISTS host_tags (
  host_id  TEXT    NOT NULL REFERENCES hosts(host_id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (host_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_host_tags_tag ON host_tags(tag_id);

-- Track migration
INSERT INTO _migrations (name) VALUES ('0010_tags') ON CONFLICT(name) DO NOTHING;
