-- Per-family public addresses.
--
-- `public_ip` keeps its meaning: the preferred public address, IPv4 first.
-- The two new columns hold each family independently so a host that reports
-- both stays visible with both. Additive only — no table copy, no rewrite of
-- the existing rows.
--
-- There is deliberately no backfill here. A historical `public_ip` may hold
-- any string, and deciding which family it belongs to needs a real address
-- parser, not SQL string matching. The read path derives each family from its
-- own column and falls back to the legacy value only when it parses as that
-- family, so an invalid historical value never surfaces and never wins.

ALTER TABLE hosts ADD COLUMN public_ip_v4 TEXT;
ALTER TABLE hosts ADD COLUMN public_ip_v6 TEXT;

INSERT INTO _migrations(name) VALUES ('0034_public_ip_families') ON CONFLICT(name) DO NOTHING;
