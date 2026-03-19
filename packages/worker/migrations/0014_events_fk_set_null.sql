-- Fix: webhook deletion should NOT cascade-delete event history.
-- Change events.webhook_config_id FK from ON DELETE CASCADE to ON DELETE SET NULL.
-- SQLite does not support ALTER CONSTRAINT, so we recreate the table.

CREATE TABLE IF NOT EXISTS events_new (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  host_id           TEXT    NOT NULL,
  webhook_config_id INTEGER,
  title             TEXT    NOT NULL,
  body              TEXT    NOT NULL,
  tags              TEXT    NOT NULL DEFAULT '[]',
  source_ip         TEXT    NOT NULL,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (host_id) REFERENCES hosts(host_id) ON DELETE CASCADE,
  FOREIGN KEY (webhook_config_id) REFERENCES webhook_configs(id) ON DELETE SET NULL
);

INSERT INTO events_new (id, host_id, webhook_config_id, title, body, tags, source_ip, created_at)
  SELECT id, host_id, webhook_config_id, title, body, tags, source_ip, created_at FROM events;

DROP TABLE events;

ALTER TABLE events_new RENAME TO events;

CREATE INDEX IF NOT EXISTS idx_events_host_created ON events(host_id, created_at DESC);
