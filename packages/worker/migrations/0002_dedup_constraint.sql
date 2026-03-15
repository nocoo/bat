-- 0002_dedup_constraint.sql
-- Add UNIQUE constraint on metrics_raw(host_id, ts) to prevent duplicate rows
-- from Probe retries. Replaces the existing non-unique index.
-- Applied via: wrangler d1 execute bat-db --file=migrations/0002_dedup_constraint.sql

INSERT OR IGNORE INTO _migrations (id, name) VALUES (2, '0002_dedup_constraint');

-- Drop old non-unique index
DROP INDEX IF EXISTS idx_raw_host_ts;

-- Add unique index (acts as UNIQUE constraint in SQLite)
CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_host_ts ON metrics_raw(host_id, ts);
