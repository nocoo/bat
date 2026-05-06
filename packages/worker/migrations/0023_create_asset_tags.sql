-- Tag associations for assets (reuses existing tags table).
-- Hard delete cascades from both sides.

CREATE TABLE asset_tags (
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (asset_id, tag_id)
);

CREATE INDEX idx_asset_tags_tag_id ON asset_tags(tag_id);
