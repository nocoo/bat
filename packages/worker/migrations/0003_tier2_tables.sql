-- 0003_tier2_tables.sql
-- Tier 2 periodic snapshot storage + alert_states severity expansion
-- Applied via: wrangler d1 execute bat-db --file=migrations/0003_tier2_tables.sql

INSERT OR IGNORE INTO _migrations (id, name) VALUES (3, '0003_tier2_tables');

-- Tier 2 periodic snapshots (90-day retention, same as hourly)
CREATE TABLE IF NOT EXISTS tier2_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  host_id       TEXT    NOT NULL,
  ts            INTEGER NOT NULL,
  ports_json    TEXT,
  updates_json  TEXT,
  systemd_json  TEXT,
  security_json TEXT,
  docker_json   TEXT,
  disk_deep_json TEXT,
  FOREIGN KEY (host_id) REFERENCES hosts(host_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tier2_host_ts ON tier2_snapshots(host_id, ts);

-- Expand alert_states severity CHECK to include 'info'
-- SQLite doesn't support ALTER TABLE ... MODIFY CHECK, so we use the
-- standard rename-and-copy pattern to preserve existing alert data.

CREATE TABLE IF NOT EXISTS alert_states_new (
  host_id      TEXT NOT NULL,
  rule_id      TEXT NOT NULL,
  severity     TEXT NOT NULL CHECK(severity IN ('info', 'warning', 'critical')),
  value        REAL,
  triggered_at INTEGER NOT NULL,
  message      TEXT,
  PRIMARY KEY (host_id, rule_id),
  FOREIGN KEY (host_id) REFERENCES hosts(host_id)
);

INSERT OR IGNORE INTO alert_states_new (host_id, rule_id, severity, value, triggered_at, message)
  SELECT host_id, rule_id, severity, value, triggered_at, message FROM alert_states;

DROP TABLE IF EXISTS alert_states;

ALTER TABLE alert_states_new RENAME TO alert_states;
