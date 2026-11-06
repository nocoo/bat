-- Connect workstation reads: additive junction between keys and workstations.
--
-- Existing keys keep an empty workstation set until an Access manager explicitly
-- edits them, so no key widens implicitly. Workstation reads are GET-only; the
-- junction carries no scope and never grants reports, enrollment or revocation.
-- Deleting a workstation cascades these rows in the same statement as the
-- workstation delete, and disabling a workstation removes it from the effective
-- grant set on the next request without touching the junction.

CREATE TABLE connect_token_workstations (
  token_id TEXT NOT NULL REFERENCES connect_tokens(id) ON DELETE CASCADE,
  workstation_id TEXT NOT NULL REFERENCES workstations(id) ON DELETE CASCADE,
  PRIMARY KEY (token_id, workstation_id)
);
CREATE INDEX connect_token_workstations_ws ON connect_token_workstations(workstation_id, token_id);

INSERT INTO _migrations(name) VALUES ('0032_connect_workstations');
