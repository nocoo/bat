# Bat — Project Instructions

## Version Management

- **Single source of truth**: root `package.json` `version` field
- **Sync script**: `scripts/sync-version.sh` — reads version from root `package.json`, updates:
  - `packages/shared/package.json`
  - `packages/worker/package.json`
  - `packages/dashboard/package.json`
  - `packages/shared/src/version.ts` (auto-generated, do not edit manually)
  - `probe/Cargo.toml`
- **When to run**: before each release, edit root `package.json` version then run `scripts/sync-version.sh`
- **Version format**: `X.Y.Z`, displayed with `v` prefix (e.g. `v0.2.0`)
- **Increment rules**:
  - Default Z+1 (patch)
  - Y+1 (minor, Z reset to 0) when: > 3 days since last bump, or > 500 lines changed
  - User can override; if unspecified, auto-determine
- **Version surfaces**:
  - Dashboard sidebar (`v{version}` badge)
  - Worker `GET /api/live` → `version` field
  - Dashboard `GET /api/live` → `version` field
  - Probe payloads: `IdentityPayload.probe_version`, `MetricsPayload.probe_version`

## API Endpoints

- `/api/live` (GET, public, no auth, Cache-Control: no-store) — replaces former `/api/health`
  - **Worker**: returns system health status + version + host health statistics
  - **Dashboard**: returns liveness + version + component name
- Write routes (probe → worker): `POST /api/ingest`, `POST /api/identity` — require `BAT_WRITE_KEY`
- Read routes (dashboard → worker): `GET /api/hosts`, `GET /api/hosts/:id/metrics`, `GET /api/alerts` — require `BAT_READ_KEY`

## Testing

- Worker/Dashboard: `bun test`
- Probe: `cargo test`
- Pre-commit hook runs: typecheck → lint → unit tests → rust checks (clippy + test)
- Coverage thresholds enforced by `scripts/check-coverage.sh`
