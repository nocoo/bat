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
3. Upload binaries to R2 (`zhe` bucket) — **both** versioned and latest:
   ```bash
   VERSION=$(jq -r .version package.json)
   wrangler r2 object put "zhe/apps/bat/${VERSION}/bat-probe-linux-x86_64" --file probe/out/bat-probe-linux-x86_64 --remote
   wrangler r2 object put "zhe/apps/bat/${VERSION}/bat-probe-linux-aarch64" --file probe/out/bat-probe-linux-aarch64 --remote
   wrangler r2 object put "zhe/apps/bat/latest/bat-probe-linux-x86_64" --file probe/out/bat-probe-linux-x86_64 --remote
   wrangler r2 object put "zhe/apps/bat/latest/bat-probe-linux-aarch64" --file probe/out/bat-probe-linux-aarch64 --remote
   ```
   - Public URL prefix: `https://s.zhe.to/apps/bat/`
   - `install.sh` fetches from `latest/` by default — no script changes needed per release
4. Commit, push, deploy Worker (Cloudflare) and Dashboard (Railway)
5. Verify:
   - `curl -sI https://s.zhe.to/apps/bat/latest/bat-probe-linux-x86_64` → 200
   - `curl -s https://bat.hexly.ai/api/probe/install.sh | head -1` → `#!/usr/bin/env bash`

### Installation

- Install script: `probe/install.sh`, served via `GET /api/probe/install.sh`
- Binaries served via `GET /api/probe/bin/:arch` (x86_64 | aarch64)
- Both public (no auth), excluded from proxy.ts matcher
- Setup page (`/setup`): auth-protected, shows pre-filled install command
- Dashboard env vars: `BAT_WRITE_KEY` (for setup page), `PROBE_BIN_DIR` (binary storage path, default `/app/probe-bin`)

### Known pitfall: standalone server cwd

Next.js standalone `server.js` calls `process.chdir(__dirname)`, so runtime `cwd` is `/app/packages/dashboard`, NOT `/app`. Any file assets (e.g. `probe-assets/install.sh`) must be placed relative to that path in the Dockerfile.

## Deployment

### Infrastructure

- **Worker**: Cloudflare Workers (`bat-worker`), deploy with `npx wrangler deploy --env production`
- **Database**: Cloudflare D1 (`bat-db`), migrations via `npx wrangler d1 migrations apply bat-db --remote --env production`
- **Dashboard**: Railway (Docker)
- **Probe binaries**: R2 bucket `zhe`, public URL prefix `https://s.zhe.to/apps/bat/`

### Test hosts

Probes are deployed on personal VPS fleet. SSH access uses `~/.ssh/id_rsa` key.

| Host | User | Arch | Probe path | Config |
|------|------|------|-----------|--------|
| us2.nocoo.cloud | nocoo | x86_64 | `/usr/local/bin/bat-probe` | `/etc/bat-probe/config.toml` |

Upgrade probe on a host:
```bash
ssh -i ~/.ssh/id_rsa nocoo@<host> "sudo systemctl stop bat-probe && sudo curl -fsSL -o /usr/local/bin/bat-probe https://s.zhe.to/apps/bat/latest/bat-probe-linux-x86_64 && sudo chmod +x /usr/local/bin/bat-probe && sudo systemctl start bat-probe"
```

### Cross-compile pitfall: Dockerfile.build output naming

`probe/Dockerfile.build` hardcodes output filename as `bat-probe-linux-x86_64` regardless of `--platform`. When building both architectures sequentially to the same output dir, build aarch64 first, rename, then build x86_64. Or build to separate dirs.

## Retrospective

- **Cargo cache bust in Docker**: When using a dummy `main.rs` to cache deps, Docker `COPY` preserves original file mtime. If the real source has an older mtime than the cached build artifact, `cargo build` skips recompilation and produces the dummy binary. Fix: `touch src/main.rs` before `cargo build`.
- **R2 CDN caching**: Uploading to the same R2 key with updated content may serve stale data due to Cloudflare CDN caching. When updating binaries in-place (e.g. `latest/`), either purge cache, use versioned paths, or SCP directly for immediate updates.
- **Migration DROP TABLE destroys alert state**: `0003_tier2_tables.sql` uses `DROP TABLE IF EXISTS alert_states` + `CREATE TABLE` to add `'info'` to the CHECK constraint (SQLite doesn't support `ALTER TABLE ... ADD CHECK`). This clears all active alerts on deploy. Tier 1 alerts self-heal on the next 30s ingest, but Tier 2 instant alerts need the next 6h tier2 cycle, and Tier 2 duration alerts (7d threshold) lose their promotion progress entirely. Future migrations should use `CREATE TABLE new → INSERT INTO new SELECT → DROP old → ALTER TABLE new RENAME` to preserve data.
