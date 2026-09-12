-- Connect credentials are recoverable AEAD ciphertext, never plaintext.
CREATE TABLE connect_server_grants (
  server_id TEXT NOT NULL REFERENCES hosts(host_id) ON DELETE CASCADE,
  principal TEXT NOT NULL,
  revoked_at INTEGER,
  PRIMARY KEY (server_id, principal)
);
CREATE TABLE connect_tokens (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES hosts(host_id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 64),
  scope TEXT NOT NULL CHECK(scope IN ('read','write')),
  prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  ciphertext TEXT NOT NULL,
  owner TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  expires_at INTEGER,
  revoked_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX connect_tokens_server ON connect_tokens(server_id, created_at, id);
CREATE TABLE connect_confirmations (
  nonce_hash TEXT PRIMARY KEY,
  token_id TEXT NOT NULL REFERENCES connect_tokens(id) ON DELETE CASCADE,
  principal TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('reveal','rotate','revoke')),
  version INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE connect_audit (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  server_id TEXT,
  token_id TEXT,
  actor TEXT NOT NULL,
  operation TEXT NOT NULL,
  status INTEGER NOT NULL,
  code TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX connect_audit_server ON connect_audit(server_id, created_at DESC, id);
CREATE TABLE connect_requests (
  token_id TEXT NOT NULL REFERENCES connect_tokens(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  request_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','complete')),
  status INTEGER,
  response TEXT,
  etag TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (token_id, key_hash)
);
CREATE TABLE connect_rate_windows (
  key TEXT PRIMARY KEY,
  window INTEGER NOT NULL,
  count INTEGER NOT NULL
);
CREATE TABLE connect_server_versions (
  server_id TEXT PRIMARY KEY REFERENCES hosts(host_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0
);
INSERT INTO connect_server_versions(server_id) SELECT host_id FROM hosts;
ALTER TABLE tags ADD COLUMN owner_host_id TEXT REFERENCES hosts(host_id) ON DELETE CASCADE;
CREATE INDEX tags_owner_host ON tags(owner_host_id);

-- Configuration ETags observe browser, CLI and Connect changes. Probe samples
-- do not invalidate configuration ETags; inventory is observational telemetry.
CREATE TRIGGER connect_host_created AFTER INSERT ON hosts BEGIN
  INSERT OR IGNORE INTO connect_server_versions(server_id) VALUES (NEW.host_id);
END;
CREATE TRIGGER connect_host_configuration AFTER UPDATE OF description, maintenance_start, maintenance_end, maintenance_reason, is_active ON hosts BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id = NEW.host_id;
END;

CREATE TRIGGER connect_agents_insert AFTER INSERT ON agents BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (NEW.host_id);
END;

CREATE TRIGGER connect_agents_update AFTER UPDATE ON agents BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (OLD.host_id);
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (NEW.host_id);
END;

CREATE TRIGGER connect_agents_delete BEFORE DELETE ON agents BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (OLD.host_id);
END;

CREATE TRIGGER connect_assets_insert AFTER INSERT ON assets BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (NEW.host_id);
END;

CREATE TRIGGER connect_assets_update AFTER UPDATE ON assets BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (OLD.host_id);
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (NEW.host_id);
END;

CREATE TRIGGER connect_assets_delete BEFORE DELETE ON assets BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (OLD.host_id);
END;

CREATE TRIGGER connect_host_tags_insert AFTER INSERT ON host_tags BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (NEW.host_id);
END;

CREATE TRIGGER connect_host_tags_update AFTER UPDATE ON host_tags BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (OLD.host_id);
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (NEW.host_id);
END;

CREATE TRIGGER connect_host_tags_delete BEFORE DELETE ON host_tags BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (OLD.host_id);
END;

CREATE TRIGGER connect_port_allowlist_insert AFTER INSERT ON port_allowlist BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (NEW.host_id);
END;

CREATE TRIGGER connect_port_allowlist_update AFTER UPDATE ON port_allowlist BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (OLD.host_id);
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (NEW.host_id);
END;

CREATE TRIGGER connect_port_allowlist_delete BEFORE DELETE ON port_allowlist BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (OLD.host_id);
END;

CREATE TRIGGER connect_webhook_configs_insert AFTER INSERT ON webhook_configs BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (NEW.host_id);
END;

CREATE TRIGGER connect_webhook_configs_update AFTER UPDATE OF host_id, token, is_active, rate_limit ON webhook_configs BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (OLD.host_id);
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (NEW.host_id);
END;

CREATE TRIGGER connect_webhook_configs_delete BEFORE DELETE ON webhook_configs BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (OLD.host_id);
END;

CREATE TRIGGER connect_agent_tags_insert AFTER INSERT ON agent_tags BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (SELECT host_id FROM agents WHERE id = NEW.agent_id);
END;

CREATE TRIGGER connect_agent_tags_update AFTER UPDATE ON agent_tags BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (SELECT host_id FROM agents WHERE id = OLD.agent_id);
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (SELECT host_id FROM agents WHERE id = NEW.agent_id);
END;

CREATE TRIGGER connect_agent_tags_delete BEFORE DELETE ON agent_tags BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (SELECT host_id FROM agents WHERE id = OLD.agent_id);
END;

CREATE TRIGGER connect_asset_tags_insert AFTER INSERT ON asset_tags BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (SELECT host_id FROM assets WHERE id = NEW.asset_id);
END;

CREATE TRIGGER connect_asset_tags_update AFTER UPDATE ON asset_tags BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (SELECT host_id FROM assets WHERE id = OLD.asset_id);
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (SELECT host_id FROM assets WHERE id = NEW.asset_id);
END;

CREATE TRIGGER connect_asset_tags_delete BEFORE DELETE ON asset_tags BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (SELECT host_id FROM assets WHERE id = OLD.asset_id);
END;

CREATE TRIGGER connect_bindings_insert AFTER INSERT ON agent_asset_bindings BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (SELECT host_id FROM agents WHERE id = NEW.agent_id UNION SELECT host_id FROM assets WHERE id = NEW.asset_id);
END;

CREATE TRIGGER connect_bindings_update AFTER UPDATE ON agent_asset_bindings BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (SELECT host_id FROM agents WHERE id = OLD.agent_id UNION SELECT host_id FROM assets WHERE id = OLD.asset_id);
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (SELECT host_id FROM agents WHERE id = NEW.agent_id UNION SELECT host_id FROM assets WHERE id = NEW.asset_id);
END;

CREATE TRIGGER connect_bindings_delete BEFORE DELETE ON agent_asset_bindings BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (SELECT host_id FROM agents WHERE id = OLD.agent_id UNION SELECT host_id FROM assets WHERE id = OLD.asset_id);
END;

CREATE TRIGGER connect_tags_insert AFTER INSERT ON tags BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (SELECT NEW.owner_host_id UNION SELECT host_id FROM host_tags WHERE tag_id = NEW.id UNION SELECT a.host_id FROM agents a JOIN agent_tags t ON t.agent_id = a.id WHERE t.tag_id = NEW.id UNION SELECT a.host_id FROM assets a JOIN asset_tags t ON t.asset_id = a.id WHERE t.tag_id = NEW.id);
END;

CREATE TRIGGER connect_tags_update AFTER UPDATE OF name, color, owner_host_id ON tags BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (SELECT OLD.owner_host_id UNION SELECT host_id FROM host_tags WHERE tag_id = OLD.id UNION SELECT a.host_id FROM agents a JOIN agent_tags t ON t.agent_id = a.id WHERE t.tag_id = OLD.id UNION SELECT a.host_id FROM assets a JOIN asset_tags t ON t.asset_id = a.id WHERE t.tag_id = OLD.id);
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (SELECT NEW.owner_host_id UNION SELECT host_id FROM host_tags WHERE tag_id = NEW.id UNION SELECT a.host_id FROM agents a JOIN agent_tags t ON t.agent_id = a.id WHERE t.tag_id = NEW.id UNION SELECT a.host_id FROM assets a JOIN asset_tags t ON t.asset_id = a.id WHERE t.tag_id = NEW.id);
END;

CREATE TRIGGER connect_tags_delete BEFORE DELETE ON tags BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id IN (SELECT OLD.owner_host_id UNION SELECT host_id FROM host_tags WHERE tag_id = OLD.id UNION SELECT a.host_id FROM agents a JOIN agent_tags t ON t.agent_id = a.id WHERE t.tag_id = OLD.id UNION SELECT a.host_id FROM assets a JOIN asset_tags t ON t.asset_id = a.id WHERE t.tag_id = OLD.id);
END;

CREATE TRIGGER connect_settings_updated AFTER UPDATE ON settings BEGIN
  UPDATE connect_server_versions SET revision = revision + 1;
END;
INSERT INTO _migrations(name) VALUES ('0028_connect') ON CONFLICT(name) DO NOTHING;

