-- Agent ↔ Asset many-to-many bindings.
-- Hard delete cascades from both sides.

CREATE TABLE agent_asset_bindings (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (agent_id, asset_id)
);

CREATE INDEX idx_bindings_asset_id ON agent_asset_bindings(asset_id);
