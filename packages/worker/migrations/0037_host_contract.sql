-- Manual per-host contract inputs, next to the billing columns.
--
-- Three independent columns — unlike the billing trio they are set or
-- cleared one by one, so a host can carry a price but no bandwidth:
--   bandwidth_mbps    — port bandwidth as entered, in Mbps
--   traffic_quota_gb  — monthly traffic allowance, in GB
--   traffic_reset_day — calendar day of month the traffic counter resets (1-31)
--
-- There is deliberately no backfill — a host carries no contract data
-- until an operator records it.

ALTER TABLE hosts ADD COLUMN bandwidth_mbps INTEGER;
ALTER TABLE hosts ADD COLUMN traffic_quota_gb INTEGER;
ALTER TABLE hosts ADD COLUMN traffic_reset_day INTEGER;

INSERT INTO _migrations(name) VALUES ('0037_host_contract') ON CONFLICT(name) DO NOTHING;
