-- Per-family public addresses.
--
-- `public_ip` keeps its meaning: the preferred public address, IPv4 first.
-- The two new columns hold each family independently so a host that reports
-- both stays visible with both. Additive only — no table copy, no rewrite of
-- the existing rows.

ALTER TABLE hosts ADD COLUMN public_ip_v4 TEXT;
ALTER TABLE hosts ADD COLUMN public_ip_v6 TEXT;

-- Backfill from the single column that existed before the split. Hosts observed
-- by an older probe keep showing their address: the UI reads the family columns
-- only, so without this an existing fleet would appear address-less.
-- Non-destructive: `public_ip` itself is never rewritten here.
UPDATE hosts SET public_ip_v4 = public_ip
WHERE public_ip IS NOT NULL AND public_ip NOT LIKE '%:%';

UPDATE hosts SET public_ip_v6 = public_ip
WHERE public_ip IS NOT NULL AND public_ip LIKE '%:%';

INSERT INTO _migrations(name) VALUES ('0034_public_ip_families') ON CONFLICT(name) DO NOTHING;
