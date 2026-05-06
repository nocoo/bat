-- Tag associations for agents (reuses existing tags table).
-- Hard delete cascades from both sides.

CREATE TABLE agent_tags (
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, tag_id)
);

CREATE INDEX idx_agent_tags_tag_id ON agent_tags(tag_id);
