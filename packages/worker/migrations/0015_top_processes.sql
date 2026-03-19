-- Add top_processes_json column to metrics_raw
-- Stores JSON array of top 50 process snapshots per 30s cycle
-- Not aggregated in metrics_hourly (process snapshots are point-in-time)
ALTER TABLE metrics_raw ADD COLUMN top_processes_json TEXT;
