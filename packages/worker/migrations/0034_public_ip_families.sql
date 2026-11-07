-- Per-family public addresses.
--
-- `public_ip` keeps its meaning: the preferred public address, IPv4 first.
-- The two new columns hold each family independently so a host that reports
-- both stays visible with both. Additive only — no table copy, no rewrite of
-- the existing rows.

ALTER TABLE hosts ADD COLUMN public_ip_v4 TEXT;
ALTER TABLE hosts ADD COLUMN public_ip_v6 TEXT;

INSERT INTO _migrations(name) VALUES ('0034_public_ip_families') ON CONFLICT(name) DO NOTHING;
