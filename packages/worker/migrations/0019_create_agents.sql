-- Create agents table — AI Agents with CLI heartbeat capability.
-- source_key: random installation ID from CLI, stable per machine.
-- host_id: nullable, manually linked via UI/CLI.

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  host_id TEXT REFERENCES hosts(host_id) ON DELETE SET NULL,
  source_key TEXT NOT NULL,
  match_key TEXT NOT NULL,
  nickname TEXT,
  role TEXT,
  runtime_app TEXT,
  runtime_version TEXT,
  status TEXT NOT NULL DEFAULT 'unknown'
    CHECK(status IN ('running','stopped','missing','unknown')),
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER,
  UNIQUE(source_key, match_key)
);

CREATE INDEX idx_agents_host_id ON agents(host_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_source_key ON agents(source_key);
