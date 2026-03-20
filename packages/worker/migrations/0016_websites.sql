-- Add websites_json column for website discovery data
ALTER TABLE tier2_snapshots ADD COLUMN websites_json TEXT;
