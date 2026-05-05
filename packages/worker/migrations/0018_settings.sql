-- Settings key-value store
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed default retention window
INSERT OR IGNORE INTO settings (key, value) VALUES ('retention_days', '7');
