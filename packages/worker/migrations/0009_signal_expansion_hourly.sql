-- Signal expansion hourly aggregation columns for metrics_hourly
-- Split from 0008 due to D1 100-column-per-table limit
-- All new aggregation values stored as JSON in a single column
-- Design: docs/01-metrics-catalogue.md

ALTER TABLE metrics_hourly ADD COLUMN ext_json TEXT;
