-- Per-host port allowlist for public_port alert suppression
CREATE TABLE IF NOT EXISTS port_allowlist (
  host_id    TEXT    NOT NULL,
  port       INTEGER NOT NULL,
  reason     TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (host_id, port),
  FOREIGN KEY (host_id) REFERENCES hosts(host_id) ON DELETE CASCADE
);
