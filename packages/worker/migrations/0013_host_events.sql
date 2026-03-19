-- Host Events: webhook configs and event log
-- Design: docs/13-host-events.md

CREATE TABLE IF NOT EXISTS webhook_configs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  host_id         TEXT    NOT NULL UNIQUE,
  token           TEXT    NOT NULL UNIQUE,
  rate_limit      INTEGER NOT NULL DEFAULT 10,
  is_active       INTEGER NOT NULL DEFAULT 1,
  window_start    INTEGER NOT NULL DEFAULT 0,
  window_count    INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (host_id) REFERENCES hosts(host_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  host_id           TEXT    NOT NULL,
  webhook_config_id INTEGER NOT NULL,
  title             TEXT    NOT NULL,
  body              TEXT    NOT NULL,
  tags              TEXT    NOT NULL DEFAULT '[]',
  source_ip         TEXT    NOT NULL,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (host_id) REFERENCES hosts(host_id) ON DELETE CASCADE,
  FOREIGN KEY (webhook_config_id) REFERENCES webhook_configs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_host_created ON events(host_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_token ON webhook_configs(token);
