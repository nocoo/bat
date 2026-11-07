-- Headless workstation enrollment.
--
-- A machine without a browser starts a pairing: it posts a PKCE challenge and a
-- display name to the ingest host, gets back an eight character short code and
-- keeps the full PKCE code locally. An operator with an Access session approves
-- the short code, which stamps `owner` and `approved_at`. The exchange then
-- refuses any pairing row that was never approved, so a leaked short code alone
-- cannot register a machine.

ALTER TABLE workstation_codes ADD COLUMN pairing_hash TEXT;
ALTER TABLE workstation_codes ADD COLUMN approved_at INTEGER;

CREATE UNIQUE INDEX workstation_codes_pairing ON workstation_codes(pairing_hash)
WHERE pairing_hash IS NOT NULL;

INSERT INTO _migrations(name) VALUES ('0033_workstation_pairing');
