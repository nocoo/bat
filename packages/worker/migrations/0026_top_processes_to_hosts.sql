-- Lift top_processes_json off metrics_raw and onto hosts.
-- Rationale: front end only ever shows the latest snapshot, so per-30s history
-- on metrics_raw was pure dead weight (~1.1 GB of the 1.6 GB DB at fleet=6,
-- retention=7d). New layout: one row per host, refreshed by ingest.
-- top_processes_ts records when the snapshot was taken (probe payload ts).
ALTER TABLE hosts ADD COLUMN top_processes_json TEXT;
ALTER TABLE hosts ADD COLUMN top_processes_ts INTEGER;
