-- 0001_initial.sql
-- Full DDL for bat monitoring system
-- Applied via: wrangler d1 execute bat-db --file=migrations/0001_initial.sql

-- Migration tracking
CREATE TABLE IF NOT EXISTS _migrations (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL UNIQUE,
  applied INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO _migrations (id, name) VALUES (1, '0001_initial');

-- Host identity and lifecycle
CREATE TABLE IF NOT EXISTS hosts (
  host_id             TEXT PRIMARY KEY,
  hostname            TEXT NOT NULL,
  os                  TEXT,
  kernel              TEXT,
  arch                TEXT,
  cpu_model           TEXT,
  boot_time           INTEGER,
  last_seen           INTEGER NOT NULL,
  identity_updated_at INTEGER,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Raw metrics (7-day retention)
CREATE TABLE IF NOT EXISTS metrics_raw (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  host_id         TEXT    NOT NULL,
  ts              INTEGER NOT NULL,
  cpu_load1       REAL,
  cpu_load5       REAL,
  cpu_load15      REAL,
  cpu_usage_pct   REAL,
  cpu_iowait      REAL,
  cpu_steal       REAL,
  cpu_count       INTEGER,
  mem_total       INTEGER,
  mem_available   INTEGER,
  mem_used_pct    REAL,
  swap_total      INTEGER,
  swap_used       INTEGER,
  swap_used_pct   REAL,
  disk_json       TEXT,
  net_json        TEXT,
  uptime_seconds  INTEGER,
  FOREIGN KEY (host_id) REFERENCES hosts(host_id)
);

CREATE INDEX IF NOT EXISTS idx_raw_host_ts ON metrics_raw(host_id, ts);

-- Hourly aggregated metrics (90-day retention)
CREATE TABLE IF NOT EXISTS metrics_hourly (
  host_id          TEXT    NOT NULL,
  hour_ts          INTEGER NOT NULL,
  sample_count     INTEGER NOT NULL,
  cpu_usage_avg    REAL,
  cpu_usage_max    REAL,
  cpu_iowait_avg   REAL,
  cpu_steal_avg    REAL,
  cpu_load1_avg    REAL,
  cpu_load5_avg    REAL,
  cpu_load15_avg   REAL,
  mem_total        INTEGER,
  mem_available_min INTEGER,
  mem_used_pct_avg REAL,
  mem_used_pct_max REAL,
  swap_total       INTEGER,
  swap_used_max    INTEGER,
  swap_used_pct_avg REAL,
  swap_used_pct_max REAL,
  uptime_min       INTEGER,
  disk_json        TEXT,
  net_rx_bytes_avg REAL,
  net_rx_bytes_max REAL,
  net_tx_bytes_avg REAL,
  net_tx_bytes_max REAL,
  net_rx_errors    INTEGER,
  net_tx_errors    INTEGER,
  PRIMARY KEY (host_id, hour_ts),
  FOREIGN KEY (host_id) REFERENCES hosts(host_id)
);

-- Active alerts
CREATE TABLE IF NOT EXISTS alert_states (
  host_id      TEXT NOT NULL,
  rule_id      TEXT NOT NULL,
  severity     TEXT NOT NULL CHECK(severity IN ('warning', 'critical')),
  value        REAL,
  triggered_at INTEGER NOT NULL,
  message      TEXT,
  PRIMARY KEY (host_id, rule_id),
  FOREIGN KEY (host_id) REFERENCES hosts(host_id)
);

-- Duration-based alert staging
CREATE TABLE IF NOT EXISTS alert_pending (
  host_id    TEXT NOT NULL,
  rule_id    TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_value REAL,
  PRIMARY KEY (host_id, rule_id)
);
