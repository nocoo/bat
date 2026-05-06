-- Create assets table — generic digital asset catalog.
-- type: coarse category (cloud_service, domain, container, cli_tool, mcp_service)
-- subtype: fine-grained classifier (e.g. 'workers', 'pages', 'r2', 'tunnel')
-- provider: vendor name (e.g. 'cloudflare', 'docker', 'vercel')

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  host_id TEXT REFERENCES hosts(host_id) ON DELETE SET NULL,
  type TEXT NOT NULL
    CHECK(type IN ('cloud_service','domain','container','cli_tool','mcp_service')),
  subtype TEXT,
  name TEXT NOT NULL,
  provider TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','inactive','missing','unknown')),
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER
);

CREATE INDEX idx_assets_host_id ON assets(host_id);
CREATE INDEX idx_assets_type_subtype ON assets(type, subtype);
CREATE INDEX idx_assets_status ON assets(status);
