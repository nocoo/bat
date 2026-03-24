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

Dev machine is macOS ARM; probes run on Linux x86_64/aarch64. Use Docker to cross-compile.

**Key paths:**
- Dockerfile: `probe/Dockerfile.build` (rust:1-alpine + musl, opt-level=z + LTO + strip)
- Output dir: `probe/out/` (gitignored)
- Binary names: `bat-probe-linux-x86_64`, `bat-probe-linux-aarch64`
- Binary size: ~3.5MB x86_64, ~3.0MB aarch64 (fully static musl ELF)

**Build steps** (must run from project root):

```bash
cd /Users/nocoo/workspace/personal/bat

# 1. Build x86_64 (output to probe/out/)
docker build --platform linux/amd64 -f probe/Dockerfile.build -o probe/out .

# 2. Build aarch64 to SEPARATE dir (Dockerfile hardcodes output name as bat-probe-linux-x86_64)
docker build --platform linux/arm64 -f probe/Dockerfile.build -o probe/out-arm64 .

# 3. Rename aarch64 binary to correct name
mv probe/out-arm64/bat-probe-linux-x86_64 probe/out/bat-probe-linux-aarch64
rm -rf probe/out-arm64

# 4. Verify binaries are correct architecture and static
file probe/out/bat-probe-linux-x86_64    # expect: ELF 64-bit x86-64, static-pie linked
file probe/out/bat-probe-linux-aarch64   # expect: ELF 64-bit ARM aarch64, statically linked
```

**⚠️ Dockerfile output naming pitfall**: `probe/Dockerfile.build` hardcodes the output filename as `bat-probe-linux-x86_64` regardless of `--platform`. Always build to separate output dirs, then rename.

### Release checklist

1. Bump version in root `package.json`, run `scripts/sync-version.sh`, then `cd probe && cargo generate-lockfile`
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
4. Apply D1 migrations (if any): `cd packages/worker && npx wrangler d1 migrations apply bat-db --remote --env production`
5. Deploy Worker: `npx wrangler deploy --env production`
6. Push to git (triggers Railway Dashboard auto-deploy; if not triggered, use `railway up --detach -s 201dad47-1d69-4222-821a-4756d3d211ce`)
7. Upgrade probes on VPS fleet (see upgrade command below)
8. Verify:
   - `curl -sI https://s.zhe.to/apps/bat/latest/bat-probe-linux-x86_64` → 200
   - `curl -s https://bat-ingest.worker.hexly.ai/api/live | jq .version` → new version
   - `curl -s https://bat.hexly.ai/api/live | jq .version` → new version
   - D1: `top_processes_json IS NOT NULL` rows appearing with proc_count = 50

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
| jp.nocoo.cloud | nocoo | x86_64 | `/usr/local/bin/bat-probe` | `/etc/bat/config.toml` |
| us.nocoo.cloud | nocoo | x86_64 | `/usr/local/bin/bat-probe` | `/etc/bat/config.toml` |
| us2.nocoo.cloud | nocoo | x86_64 | `/usr/local/bin/bat-probe` | `/etc/bat/config.toml` |
| blog.nocoo.cloud | nocoo | x86_64 | `/usr/local/bin/bat-probe` | `/etc/bat/config.toml` |
| tongji.nocoo.cloud | nocoo | x86_64 | `/usr/local/bin/bat-probe` | `/etc/bat/config.toml` |

Upgrade probe on a host:
```bash
ssh -i ~/.ssh/id_rsa nocoo@<host> "sudo systemctl stop bat-probe && sudo curl -fsSL -o /usr/local/bin/bat-probe https://s.zhe.to/apps/bat/latest/bat-probe-linux-x86_64 && sudo chmod +x /usr/local/bin/bat-probe && sudo systemctl start bat-probe"
```

### Deployment history in memory

Past deployment records (URLs, version IDs, VPS fleet status, timestamps) are stored in Nowledge Mem. Query with:
```bash
nmem --json m search "bat release 部署" -l deployment -l bat -n 3
```
This returns past release records including worker version IDs, R2 paths, VPS upgrade status, and verification results. Always check memory before deploying to confirm the current fleet and any host-specific notes.

### Railway Dashboard deploy

- Railway project ID: `bb78fd59-0b33-4765-b8ff-9421157eeb82`
- Railway service ID: `201dad47-1d69-4222-821a-4756d3d211ce`
- Auto-deploy from git push is **unreliable** — may not trigger. Fallback: `railway up --detach -s 201dad47-1d69-4222-821a-4756d3d211ce`
- Dashboard URL: `https://bat.hexly.ai`

## Uptime Kuma Monitoring

Bat services are monitored via the `uptime-kuma` skill. Config lives at `.claude/skills/uptime-kuma/config.json` (gitignored).

### Usage

**Read-only (Prometheus metrics via curl):**
```bash
CONFIG="$(cat .claude/skills/uptime-kuma/config.json)"
BASE_URL=$(echo "$CONFIG" | jq -r '.base_url')
API_KEY=$(echo "$CONFIG" | jq -r '.api_key')
curl -sf -u ":$API_KEY" "$BASE_URL/metrics" | grep "^monitor_status{"
```

**Write operations (Socket.IO via bun):**
```bash
cp .claude/skills/uptime-kuma/scripts/socketio-client.mjs /tmp/uk-task.mjs
sd 'skills/uptime-kuma/config.json' "$(pwd)/.claude/skills/uptime-kuma/config.json" /tmp/uk-task.mjs
# Edit /tmp/uk-task.mjs, then: bun run /tmp/uk-task.mjs
```

Requires `socket.io-client` (`bun add -d socket.io-client`). When curl times out, prefer Socket.IO (WebSocket transport works through Cloudflare).

### When to use

- **Post-deploy verification**: confirm bat worker and VPS monitors are UP after release
- **Adding monitors**: new bat services should get keyword monitors targeting `/api/live`
- **Incident triage**: check DOWN monitors to correlate with bat alerts

## Retrospective

- **E2E test migration list must be manually updated**: `packages/worker/test/e2e/wrangler.test.ts` has a hardcoded migration list. When adding new migrations, also add them to this list — otherwise E2E tests fail with 500 on routes that touch new columns, and `git push` is blocked by the pre-push hook.
- **Docker Hub TLS timeout workaround**: `docker build` may fail with TLS handshake timeout to `auth.docker.io`, while `docker pull` succeeds (different auth path). If build fails, try `docker pull rust:1-alpine` first to cache the image, then retry `docker build`.
- **Cargo cache bust in Docker**: When using a dummy `main.rs` to cache deps, Docker `COPY` preserves original file mtime. If the real source has an older mtime than the cached build artifact, `cargo build` skips recompilation and produces the dummy binary. Fix: `touch src/main.rs` before `cargo build`.
- **R2 CDN caching**: Uploading to the same R2 key with updated content may serve stale data due to Cloudflare CDN caching. When updating binaries in-place (e.g. `latest/`), either purge cache, use versioned paths, or SCP directly for immediate updates.
- **Migration DROP TABLE destroys alert state**: `0003_tier2_tables.sql` uses `DROP TABLE IF EXISTS alert_states` + `CREATE TABLE` to add `'info'` to the CHECK constraint (SQLite doesn't support `ALTER TABLE ... ADD CHECK`). This clears all active alerts on deploy. Tier 1 alerts self-heal on the next 30s ingest, but Tier 2 instant alerts need the next 6h tier2 cycle, and Tier 2 duration alerts (7d threshold) lose their promotion progress entirely. Future migrations should use `CREATE TABLE new → INSERT INTO new SELECT → DROP old → ALTER TABLE new RENAME` to preserve data.
- **glibc version mismatch from `rust:1-slim`**: The `rust:1-slim` Docker image tracks Debian unstable/testing, so its glibc version drifts upward silently. Binaries compiled against it fail with `GLIBC_2.39 not found` on Debian 12 (glibc 2.36) and older. Fix: use `rust:1-alpine` + musl for fully static binaries with zero host libc dependency. Always verify with `file <binary>` — expect `static-pie linked`.
- **install.sh global placeholder replacement breaks self-check**: `route.ts` used `/__DASHBOARD_URL__/g` regex to inject the dashboard URL, but this also replaced the literal in the validation check (`== "__DASHBOARD_URL__"`), making it always true and blocking all installs. Fix: use precise string replacement targeting only the assignment line (`DASHBOARD_URL="__DASHBOARD_URL__"`), not a global regex.
- **D1 migration must be applied before deploying Worker code that references new columns**: Deploying Worker code that queries new columns (e.g. `maintenance_start`) without first applying the migration causes 500 on ALL routes that touch the `hosts` table — including `/api/ingest`, silently dropping all probe data fleet-wide. Always run `npx wrangler d1 migrations apply bat-db --remote --env production` BEFORE `npx wrangler deploy`.
