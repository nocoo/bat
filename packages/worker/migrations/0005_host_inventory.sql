-- Host inventory columns (identity + tier2 slow-drift fields)
-- All nullable: backward-compatible with pre-inventory probes
ALTER TABLE hosts ADD COLUMN cpu_logical      INTEGER;
ALTER TABLE hosts ADD COLUMN cpu_physical     INTEGER;
ALTER TABLE hosts ADD COLUMN mem_total_bytes  INTEGER;
ALTER TABLE hosts ADD COLUMN swap_total_bytes INTEGER;
ALTER TABLE hosts ADD COLUMN virtualization   TEXT;
ALTER TABLE hosts ADD COLUMN net_interfaces   TEXT;
ALTER TABLE hosts ADD COLUMN disks            TEXT;
ALTER TABLE hosts ADD COLUMN boot_mode        TEXT;
ALTER TABLE hosts ADD COLUMN timezone         TEXT;
ALTER TABLE hosts ADD COLUMN dns_resolvers    TEXT;
ALTER TABLE hosts ADD COLUMN dns_search       TEXT;
