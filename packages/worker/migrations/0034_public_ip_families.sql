-- Per-family public addresses.
--
-- `public_ip` keeps its meaning: the preferred public address, IPv4 first.
-- The two new columns hold each family independently so a host that reports
-- both stays visible with both. Additive only — no table copy, no rewrite of
-- the existing rows.

ALTER TABLE hosts ADD COLUMN public_ip_v4 TEXT;
ALTER TABLE hosts ADD COLUMN public_ip_v6 TEXT;

-- IPv4 family shape: one trim-normalized dotted literal with no whitespace or
-- shape junk. Octet range validation is intentionally outside the migration:
-- the historical column came from the echo service and this filter keeps invalid
-- values out of family columns without maintaining nested SQL string parsing.
UPDATE hosts SET public_ip_v4 = trim(public_ip)
WHERE public_ip IS NOT NULL
  AND trim(public_ip) <> ''
  AND trim(public_ip) = public_ip
  AND length(public_ip) BETWEEN 7 AND 15
  AND public_ip NOT GLOB '*[^0-9.]*'
  AND length(public_ip) - length(replace(public_ip, '.', '')) = 3;

-- IPv6 family shape: colon present, only hexadecimal/dot/colon characters,
-- trim-normalized, and within a literal length bound. Empty, whitespace and
-- arbitrary junk remain in public_ip only.
UPDATE hosts SET public_ip_v6 = trim(public_ip)
WHERE public_ip IS NOT NULL
  AND trim(public_ip) <> ''
  AND trim(public_ip) = public_ip
  AND public_ip GLOB '*:*'
  AND length(public_ip) <= 45
  AND public_ip NOT GLOB '*[^0-9A-Fa-f:.]*';

INSERT INTO _migrations(name) VALUES ('0034_public_ip_families') ON CONFLICT(name) DO NOTHING;
