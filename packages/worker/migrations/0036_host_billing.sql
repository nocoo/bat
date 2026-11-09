-- Manual per-host billing inputs.
--
-- Three columns, all set together or all cleared together:
--   cost_amount_cny — amount paid for the current period, in yuan
--   paid_at         — date of that payment (`YYYY-MM-DD`)
--   renews_at       — next payment / expiry date (`YYYY-MM-DD`)
--
-- The period length, the daily cost and the renewal countdown are derived
-- from these three, so nothing else is stored. Dates are calendar dates, not
-- instants: a countdown must not shift with the reader's time zone.
--
-- There is deliberately no backfill — a host carries no billing data until an
-- operator records it.

ALTER TABLE hosts ADD COLUMN cost_amount_cny REAL;
ALTER TABLE hosts ADD COLUMN paid_at TEXT;
ALTER TABLE hosts ADD COLUMN renews_at TEXT;

INSERT INTO _migrations(name) VALUES ('0036_host_billing') ON CONFLICT(name) DO NOTHING;
