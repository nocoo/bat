-- Keep server_id solely as the immutable legacy AEAD context. A host must no
-- longer own a credential: deleting one host removes just that authorization.
-- Copy dependent rows before dropping the old parent. Deferred FK checks alone
-- would NOT prevent ON DELETE CASCADE from deleting confirmations/retry records.
CREATE TABLE connect_tokens_next (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL DEFAULT '',
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
INSERT INTO connect_tokens_next SELECT * FROM connect_tokens;

CREATE TABLE connect_confirmations_next (
  nonce_hash TEXT PRIMARY KEY,
  token_id TEXT NOT NULL REFERENCES connect_tokens_next(id) ON DELETE CASCADE,
  principal TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('reveal','rotate','revoke')),
  version INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
INSERT INTO connect_confirmations_next SELECT * FROM connect_confirmations;

CREATE TABLE connect_requests_next (
  token_id TEXT NOT NULL REFERENCES connect_tokens_next(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL DEFAULT '',
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
INSERT INTO connect_requests_next
  SELECT r.token_id, t.server_id, r.key_hash, r.fingerprint, r.request_id,
    r.state, r.status, r.response, r.etag, r.created_at
  FROM connect_requests r JOIN connect_tokens t ON t.id = r.token_id;

DROP TABLE connect_confirmations;
DROP TABLE connect_requests;
DROP TABLE connect_tokens;
ALTER TABLE connect_tokens_next RENAME TO connect_tokens;
ALTER TABLE connect_confirmations_next RENAME TO connect_confirmations;
ALTER TABLE connect_requests_next RENAME TO connect_requests;
CREATE INDEX connect_tokens_server ON connect_tokens(server_id, created_at, id);
CREATE INDEX connect_tokens_owner ON connect_tokens(owner, revoked_at);

CREATE TABLE connect_token_servers (
  token_id TEXT NOT NULL REFERENCES connect_tokens(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL REFERENCES hosts(host_id) ON DELETE CASCADE,
  PRIMARY KEY (token_id, server_id)
);
CREATE INDEX connect_token_servers_server ON connect_token_servers(server_id, token_id);
INSERT INTO connect_token_servers(token_id, server_id)
  SELECT t.id, t.server_id FROM connect_tokens t
  JOIN hosts h ON h.host_id = t.server_id WHERE h.is_active = 1;

-- Bridge old Worker creates during the migration-before-deploy window. New
-- code uses an empty legacy context and writes the complete set atomically.
CREATE TRIGGER connect_legacy_token_created AFTER INSERT ON connect_tokens
WHEN NEW.server_id != '' BEGIN
  INSERT INTO connect_token_servers(token_id, server_id) VALUES (NEW.id, NEW.server_id);
END;
CREATE TRIGGER connect_legacy_request_created AFTER INSERT ON connect_requests
WHEN NEW.server_id = '' BEGIN
  UPDATE connect_requests SET server_id = (SELECT server_id FROM connect_tokens WHERE id = NEW.token_id)
    WHERE token_id = NEW.token_id AND key_hash = NEW.key_hash;
END;

-- A deleted or retired server loses its grant permanently; recreating its ID
-- must not resurrect access. Invalidate token ETags and outstanding challenges.
CREATE TRIGGER connect_token_server_removed AFTER DELETE ON connect_token_servers
WHEN NOT EXISTS (SELECT 1 FROM hosts WHERE host_id = OLD.server_id AND is_active = 1) BEGIN
  UPDATE connect_tokens SET version = version + 1 WHERE id = OLD.token_id;
END;
CREATE TRIGGER connect_host_retired AFTER UPDATE OF is_active ON hosts
WHEN NEW.is_active = 0 AND OLD.is_active != 0 BEGIN
  DELETE FROM connect_token_servers WHERE server_id = NEW.host_id;
END;

ALTER TABLE connect_audit ADD COLUMN server_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE connect_audit ADD COLUMN previous_server_ids TEXT;
UPDATE connect_audit SET server_ids = json_array(server_id) WHERE server_id IS NOT NULL;
CREATE INDEX connect_audit_token ON connect_audit(token_id, created_at DESC, id);
INSERT INTO _migrations(name) VALUES ('0029_connect_token_servers') ON CONFLICT(name) DO NOTHING;
