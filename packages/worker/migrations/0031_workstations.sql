-- Workstation enrollment, dedicated hashed keys, report history and rate windows.
--
-- Workstation keys are `batw_` + 43 base64url characters (256 random bits).
-- Only the SHA-256 hex digest is stored; the plaintext exists once at exchange.
-- Reports and connectivity rows are historical snapshots bounded by the shared
-- retention cron.
--
-- Report IDs are scoped to their workstation: the primary key is
-- (workstation_id, report_id), so two workstations may use the same report UUID
-- and one workstation cannot overwrite another's report. A retried upload of the
-- same (workstation, report) pair is idempotent while a different body under the
-- same pair is a conflict.
--
-- `consume_nonce` and `insert_nonce` are per-attempt markers. They make an
-- update depend on *this* attempt's successful write: a replayed code in the
-- same second cannot rotate the key, and a duplicate or late report cannot
-- refresh liveness, the public address or the latest snapshot.

CREATE TABLE workstations (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  installation_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 64),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  public_ip TEXT,
  disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0, 1)),
  revoked_at INTEGER,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  rotated_at INTEGER
);
CREATE INDEX workstations_owner ON workstations(owner, created_at DESC, id DESC);

CREATE TABLE workstation_codes (
  code_hash TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  challenge TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  consume_nonce TEXT UNIQUE
);
CREATE INDEX workstation_codes_installation ON workstation_codes(installation_id, created_at DESC);

CREATE TABLE workstation_reports (
  workstation_id TEXT NOT NULL REFERENCES workstations(id) ON DELETE CASCADE,
  report_id TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  cpu_usage_pct REAL,
  mem_used_pct REAL NOT NULL,
  mem_total_bytes INTEGER NOT NULL,
  mem_available_bytes INTEGER NOT NULL,
  uptime_seconds INTEGER NOT NULL,
  payload TEXT NOT NULL,
  insert_nonce TEXT,
  PRIMARY KEY (workstation_id, report_id)
);
CREATE INDEX workstation_reports_ws ON workstation_reports(workstation_id, finished_at DESC, received_at DESC, report_id DESC);

CREATE TABLE workstation_connectivity (
  workstation_id TEXT NOT NULL,
  report_id TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  server_id TEXT NOT NULL,
  address TEXT NOT NULL,
  family INTEGER NOT NULL CHECK(family IN (4, 6)),
  sent INTEGER NOT NULL,
  received INTEGER NOT NULL,
  rtts TEXT NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (workstation_id, report_id, server_id),
  FOREIGN KEY (workstation_id, report_id)
    REFERENCES workstation_reports(workstation_id, report_id) ON DELETE CASCADE
);
CREATE INDEX workstation_connectivity_ws ON workstation_connectivity(workstation_id, received_at DESC);

CREATE TABLE workstation_rate_windows (
  key TEXT PRIMARY KEY,
  window INTEGER NOT NULL,
  count INTEGER NOT NULL
);

INSERT INTO _migrations(name) VALUES ('0031_workstations');
