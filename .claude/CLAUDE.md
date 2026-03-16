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

## Probe Build & Release

### Cross-compile (macOS → Linux)

Dev machine is macOS ARM; probes run on Linux x86_64/aarch64. Use Docker to cross-compile:

```bash
# Build x86_64 binary (outputs to probe/out/)
docker build --platform linux/amd64 -f probe/Dockerfile.build -o probe/out .

# Build aarch64 binary (outputs to probe/out/)
docker build --platform linux/arm64 -f probe/Dockerfile.build -o probe/out .
```

- Dockerfile: `probe/Dockerfile.build` (rust:1-slim, opt-level=z + LTO + strip)
- Output: `probe/out/bat-probe-linux-{x86_64,aarch64}` (~300KB, statically stripped ELF)
- `probe/out/` is gitignored — binaries are build artifacts, not committed

### Release checklist

1. Bump version in root `package.json`, run `scripts/sync-version.sh`
2. Build probe binaries for both architectures (see above)
3. Upload binaries to Dashboard's `PROBE_BIN_DIR` (default `/app/probe-bin/`)
   - Filenames must be `bat-probe-linux-x86_64` and `bat-probe-linux-aarch64`
4. Deploy Worker (Cloudflare) and Dashboard (Railway)
5. Verify: `curl https://<dashboard>/api/probe/bin/x86_64 -o /dev/null -w '%{http_code}'` → 200

### Installation

- Install script: `probe/install.sh`, served via `GET /api/probe/install.sh`
- Binaries served via `GET /api/probe/bin/:arch` (x86_64 | aarch64)
- Both public (no auth), excluded from proxy.ts matcher
- Setup page (`/setup`): auth-protected, shows pre-filled install command
- Dashboard env vars: `BAT_WRITE_KEY` (for setup page), `PROBE_BIN_DIR` (binary storage path, default `/app/probe-bin`)

### Known pitfall: standalone server cwd

Next.js standalone `server.js` calls `process.chdir(__dirname)`, so runtime `cwd` is `/app/packages/dashboard`, NOT `/app`. Any file assets (e.g. `probe-assets/install.sh`) must be placed relative to that path in the Dockerfile.
