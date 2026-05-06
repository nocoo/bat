-- CLI token management for OAuth-based CLI authentication.
-- Tokens are minted via /api/auth/cli (requires CF Access JWT).
-- scope=assets: can only access /api/agents/*, /api/assets/*, /api/bindings/*
-- scope=full: equivalent to BAT_WRITE_KEY permissions.

CREATE TABLE cli_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT 'cli',
  scope TEXT NOT NULL DEFAULT 'assets'
    CHECK(scope IN ('assets','full')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used_at INTEGER
);
