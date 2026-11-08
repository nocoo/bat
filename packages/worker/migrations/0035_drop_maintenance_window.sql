-- Delete the host maintenance-window feature.
DROP TRIGGER IF EXISTS connect_host_configuration;

ALTER TABLE hosts DROP COLUMN maintenance_start;
ALTER TABLE hosts DROP COLUMN maintenance_end;
ALTER TABLE hosts DROP COLUMN maintenance_reason;

CREATE TRIGGER connect_host_configuration AFTER UPDATE OF description, is_active ON hosts BEGIN
  UPDATE connect_server_versions SET revision = revision + 1 WHERE server_id = NEW.host_id;
END;

INSERT INTO _migrations(name) VALUES ('0035_drop_maintenance_window') ON CONFLICT(name) DO NOTHING;
