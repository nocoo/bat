-- Test environment marker table
-- Applied ONLY to bat-db-test to identify test databases.
-- Usage: SELECT value FROM _test_marker WHERE key = 'env'; → 'test'
CREATE TABLE IF NOT EXISTS _test_marker (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR REPLACE INTO _test_marker (key, value) VALUES ('env', 'test');
