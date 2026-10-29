CREATE TABLE deleted_hosts (
  host_id TEXT PRIMARY KEY,
  deleted_at INTEGER NOT NULL
);

CREATE TRIGGER deleted_host_insert BEFORE INSERT ON hosts
WHEN EXISTS (SELECT 1 FROM deleted_hosts WHERE host_id = NEW.host_id) BEGIN
  SELECT RAISE(ABORT, 'host_deleted');
END;

CREATE TRIGGER deleted_host_metrics BEFORE INSERT ON metrics_raw
WHEN EXISTS (SELECT 1 FROM deleted_hosts WHERE host_id = NEW.host_id) BEGIN
  SELECT RAISE(ABORT, 'host_deleted');
END;

CREATE TRIGGER deleted_host_tier2 BEFORE INSERT ON tier2_snapshots
WHEN EXISTS (SELECT 1 FROM deleted_hosts WHERE host_id = NEW.host_id) BEGIN
  SELECT RAISE(ABORT, 'host_deleted');
END;

CREATE TRIGGER deleted_host_alert BEFORE INSERT ON alert_states
WHEN EXISTS (SELECT 1 FROM deleted_hosts WHERE host_id = NEW.host_id) BEGIN
  SELECT RAISE(ABORT, 'host_deleted');
END;

CREATE TRIGGER deleted_host_pending BEFORE INSERT ON alert_pending
WHEN EXISTS (SELECT 1 FROM deleted_hosts WHERE host_id = NEW.host_id) BEGIN
  SELECT RAISE(ABORT, 'host_deleted');
END;

INSERT INTO _migrations(name) VALUES ('0030_host_deletion');
