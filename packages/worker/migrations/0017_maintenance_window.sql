-- Per-host daily recurring maintenance window (docs/17-maintenance-window.md)
-- Both start/end must be NULL (no window) or both non-NULL ("HH:MM" UTC)
ALTER TABLE hosts ADD COLUMN maintenance_start TEXT;
ALTER TABLE hosts ADD COLUMN maintenance_end TEXT;
ALTER TABLE hosts ADD COLUMN maintenance_reason TEXT;
