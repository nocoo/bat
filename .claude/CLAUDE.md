# Bat — Project Instructions

## Architecture (Edge Dashboard)

Bat 使用 **单一 Worker 架构**，同时服务 API 和前端：

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cloudflare                                │
│                                                                  │
│  ┌─────────────────────┐      ┌─────────────────────┐           │
│  │   bat.hexly.ai      │      │ bat-ingest.worker.  │           │
│  │   (Access 保护)      │      │ hexly.ai (无 Access) │           │
│  └──────────┬──────────┘      └──────────┬──────────┘           │
│             │                            │                       │
│             ▼                            ▼                       │
│  ┌─────────────────────────────────────────────────────┐        │
│  │                   Worker (Hono)                      │        │
│  │  ├── /*              → SPA 静态文件 (packages/ui)    │        │
│  │  ├── /api/hosts      → 读路由 (Access JWT)          │        │
│  │  ├── /api/ingest     → 写路由 (BAT_WRITE_KEY)       │        │
│  │  ├── /api/monitoring → 机器读路由 (BAT_READ_KEY)    │        │
│  │  └── /api/live       → 公开路由                      │        │
│  └─────────────────────────────────────────────────────┘        │
│                              │                                   │
│                              ▼                                   │
│                          ┌──────┐                                │
│                          │  D1  │                                │
│                          └──────┘                                │
└─────────────────────────────────────────────────────────────────┘
```

**双入口认证**：
- `bat.hexly.ai`：浏览器入口，Cloudflare Access 保护，Access JWT 校验
- `bat-ingest.worker.hexly.ai`：机器入口，白名单路由 + API Key

## Version Management

- **Single source of truth**: root `package.json` `version` field
- **Sync script**: `scripts/sync-version.sh` — reads version from root `package.json`, updates:
  - `packages/shared/package.json`
  - `packages/worker/package.json`
  - `packages/ui/package.json`
  - `packages/shared/src/version.ts` (auto-generated, do not edit manually)
  - `probe/Cargo.toml`
- **When to run**: before each release, edit root `package.json` version then run `scripts/sync-version.sh`
- **Version format**: `X.Y.Z`, displayed with `v` prefix (e.g. `v0.2.0`)
- **Increment rules**:
  - Default Z+1 (patch)
  - Y+1 (minor, Z reset to 0) when: > 3 days since last bump, or > 500 lines changed
  - User can override; if unspecified, auto-determine
- **Version surfaces**:
  - UI sidebar (`v{version}` badge)
  - Worker `GET /api/live` → `version` field
  - Probe payloads: `IdentityPayload.probe_version`, `MetricsPayload.probe_version`

## API Endpoints

- `/api/live` (GET, public, no auth, Cache-Control: no-store) — health check + version
- Write routes (probe → worker): `POST /api/ingest`, `POST /api/identity`, `POST /api/tier2` — require `BAT_WRITE_KEY`
- Machine read routes: `GET /api/monitoring/*` — require `BAT_READ_KEY` (Uptime Kuma)
- Browser routes: `GET /api/hosts`, `GET /api/alerts`, etc. — require Access JWT on `bat.hexly.ai`

## Local Development

**方式 1：HMR 开发 + 生产数据（推荐日常开发）**
```bash
cd packages/ui && bun run dev   # vite dev server
```
- 访问 `https://bat.dev.hexly.ai`（Caddy 反代 → localhost:7025）
- `/api/*` 自动代理到生产 `bat-ingest.worker.hexly.ai`（获取真实数据）
- 用户信息显示为匿名（本地无 Access JWT）

**方式 2：本地全栈开发**
```bash
bun dev   # 同时启动 @bat/ui (vite dev) + @bat/worker (wrangler dev)
```
- 需要先修改 `packages/ui/vite.config.ts` 的 proxy target 为 `http://localhost:8787`
- `/api/*` 代理到 wrangler dev (8787)，使用本地 D1 数据库

**方式 3：接近生产的测试**
```bash
bun turbo build --filter=@bat/ui   # 构建到 worker/static/
cd packages/worker && bun dev      # wrangler dev 服务静态资源
```
- 访问 `localhost:8787`（wrangler 端口）
- 测试 wrangler assets 配置、SPA fallback 等

## Testing

- Worker: `bun test` (unit), `bun turbo test:e2e --filter=@bat/worker` (E2E)
- UI: `bun turbo build --filter=@bat/ui` (build only, no tests yet)
- Probe: `cargo test`
- Pre-commit hook runs: typecheck → lint → unit tests → rust checks (clippy + test)
- Coverage thresholds enforced by `scripts/check-coverage.sh`
- **CI**: GitHub Actions via `nocoo/base-ci` reusable workflow
- **Package manager**: bun (declared in `packageManager` field, single `bun.lock` lockfile)

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
2. Build UI: `cd packages/ui && bun run build`
3. Build probe binaries for both architectures (see above)
4. Upload binaries to R2 (`zhe` bucket) — **both** versioned and latest:
   ```bash
   VERSION=$(jq -r .version package.json)
   wrangler r2 object put "zhe/apps/bat/${VERSION}/bat-probe-linux-x86_64" --file probe/out/bat-probe-linux-x86_64 --remote
   wrangler r2 object put "zhe/apps/bat/${VERSION}/bat-probe-linux-aarch64" --file probe/out/bat-probe-linux-aarch64 --remote
   wrangler r2 object put "zhe/apps/bat/latest/bat-probe-linux-x86_64" --file probe/out/bat-probe-linux-x86_64 --remote
   wrangler r2 object put "zhe/apps/bat/latest/bat-probe-linux-aarch64" --file probe/out/bat-probe-linux-aarch64 --remote
   ```
   - Public URL prefix: `https://s.zhe.to/apps/bat/`
   - `install.sh` fetches from `latest/` by default — no script changes needed per release
5. Apply D1 migrations (if any): `cd packages/worker && npx wrangler d1 migrations apply bat-db --remote --env production`
6. Deploy Worker (includes UI): `cd packages/worker && npx wrangler deploy --env production`
7. Upgrade probes on VPS fleet (see upgrade command below)
8. Verify:
   - `curl -sI https://s.zhe.to/apps/bat/latest/bat-probe-linux-x86_64` → 200
   - `curl -s https://bat-ingest.worker.hexly.ai/api/live | jq .version` → new version
   - Browser: `https://bat.hexly.ai` → Access login → dashboard loads

### Installation

- Install script: `probe/install.sh`
- Binaries: R2 bucket `https://s.zhe.to/apps/bat/latest/`
- Setup page (`/setup`): shows install command template with `YOUR_WRITE_KEY` placeholder

## Deployment

### Infrastructure

- **Worker**: Cloudflare Workers (`bat`), deploy with `npx wrangler deploy --env production`
- **Database**: Cloudflare D1 (`bat-db`), migrations via `npx wrangler d1 migrations apply bat-db --remote --env production`
- **UI**: Built into Worker static assets (`packages/worker/static/`)
- **Auth**: Cloudflare Access on `bat.hexly.ai`
- **Probe binaries**: R2 bucket `zhe`, public URL prefix `https://s.zhe.to/apps/bat/`

### Cloudflare Access 配置

需要在 Cloudflare Zero Trust 控制台配置：
1. Access Application: `bat.hexly.ai`
2. Policy: Allow specific email
3. Worker secrets: `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`

### Test hosts

Probes are deployed on personal VPS fleet. SSH access uses `~/.ssh/id_rsa` key.

| Host | User | Arch | Probe path | Config |
|------|------|------|-----------|--------|
| jp.nocoo.cloud | nocoo | x86_64 | `/usr/local/bin/bat-probe` | `/etc/bat/config.toml` |
| us.nocoo.cloud | nocoo | x86_64 | `/usr/local/bin/bat-probe` | `/etc/bat/config.toml` |
| us2.nocoo.cloud | nocoo | x86_64 | `/usr/local/bin/bat-probe` | `/etc/bat/config.toml` |
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

- **bun is the sole package manager**: pnpm was removed. Only `bun.lock` exists. Husky hooks use `bun turbo` / `bunx`. Docker builds use `oven/bun:1` + `bun install --frozen-lockfile`. Do not introduce pnpm references.
- **E2E test migration list must be manually updated**: `packages/worker/test/e2e/wrangler.test.ts` has a hardcoded migration list. When adding new migrations, also add them to this list — otherwise E2E tests fail with 500 on routes that touch new columns, and `git push` is blocked by the pre-push hook.
- **Docker Hub TLS timeout workaround**: `docker build` may fail with TLS handshake timeout to `auth.docker.io`, while `docker pull` succeeds (different auth path). If build fails, try `docker pull rust:1-alpine` first to cache the image, then retry `docker build`.
- **Cargo cache bust in Docker**: When using a dummy `main.rs` to cache deps, Docker `COPY` preserves original file mtime. If the real source has an older mtime than the cached build artifact, `cargo build` skips recompilation and produces the dummy binary. Fix: `touch src/main.rs` before `cargo build`.
- **R2 CDN caching**: Uploading to the same R2 key with updated content may serve stale data due to Cloudflare CDN caching. When updating binaries in-place (e.g. `latest/`), either purge cache, use versioned paths, or SCP directly for immediate updates.
- **Migration DROP TABLE destroys alert state**: `0003_tier2_tables.sql` uses `DROP TABLE IF EXISTS alert_states` + `CREATE TABLE` to add `'info'` to the CHECK constraint (SQLite doesn't support `ALTER TABLE ... ADD CHECK`). This clears all active alerts on deploy. Tier 1 alerts self-heal on the next 30s ingest, but Tier 2 instant alerts need the next 6h tier2 cycle, and Tier 2 duration alerts (7d threshold) lose their promotion progress entirely. Future migrations should use `CREATE TABLE new → INSERT INTO new SELECT → DROP old → ALTER TABLE new RENAME` to preserve data.
- **glibc version mismatch from `rust:1-slim`**: The `rust:1-slim` Docker image tracks Debian unstable/testing, so its glibc version drifts upward silently. Binaries compiled against it fail with `GLIBC_2.39 not found` on Debian 12 (glibc 2.36) and older. Fix: use `rust:1-alpine` + musl for fully static binaries with zero host libc dependency. Always verify with `file <binary>` — expect `static-pie linked`.
- **D1 migration must be applied before deploying Worker code that references new columns**: Deploying Worker code that queries new columns (e.g. `maintenance_start`) without first applying the migration causes 500 on ALL routes that touch the `hosts` table — including `/api/ingest`, silently dropping all probe data fleet-wide. Always run `npx wrangler d1 migrations apply bat-db --remote --env production` BEFORE `npx wrangler deploy`.
- **Edge Dashboard 迁移 (2026-04)**：Next.js Dashboard 已迁移到 Cloudflare Workers 边缘部署。packages/dashboard 已废弃（保留在 git 历史），packages/ui 是新的 SPA。Railway 部署不再需要。
