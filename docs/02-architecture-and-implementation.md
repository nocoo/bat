# 02 — Architecture and Implementation Plan

> System design, testing strategy, atomic commits, and deployment plan for bat MVP.
> Prerequisite: [01-probe-metrics-spec.md](./01-probe-metrics-spec.md)

## Overview

Replace Netdata (120-243MB RSS) across 6 VPS hosts with a purpose-built monitoring system.

```
┌─────────────┐    HTTPS POST     ┌─────────────┐        ┌──────┐
│  Rust Probe  │ ───────────────→ │  CF Worker   │ ─────→ │  D1  │
│  (per VPS)   │   JSON + API Key │  (Hono)      │        │      │
└─────────────┘                   └──────┬───────┘        └──┬───┘
                                         │                   │
                              GET /api/health        API Key (server-side)
                                         │                   │
                                  ┌──────▼───────┐   ┌──────▼───────┐
                                  │ Uptime Kuma  │   │  Dashboard   │
                                  │ (existing)   │   │  Next.js 16  │
                                  └──────────────┘   │  Railway     │
                                                     └──────────────┘

Dashboard auth model:
  - User authenticates with Google OAuth on Dashboard (cookie stays on Dashboard domain)
  - Dashboard API Routes (Next.js /api/*) act as a server-side proxy to Worker
  - Dashboard server holds BAT_API_KEY, adds Authorization header when calling Worker
  - Browser never talks to Worker directly — no cross-domain cookie issue
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Probe language | Rust | Single static binary, < 15MB RSS, < 10MB disk |
| Transport | HTTPS POST JSON | CF Worker native, ~1KB/report, simple |
| Auth (probe) | Shared API Key | `Authorization: Bearer <key>`, stored as Worker secret |
| Server | CF Worker + D1 | Serverless, free tier sufficient for 6 hosts |
| Data retention | 7d raw + 90d hourly | ~17K rows/day raw, hourly cron aggregates + purges |
| Dashboard | Next.js 16 + Bun (from Surety template) | Clone auth, UI, deployment from `../surety` |
| Auth (dashboard) | Google OAuth + email allowlist | From Surety (`src/auth.ts`, `src/proxy.ts`); TOTP 2FA dropped for MVP (requires DB-backed TotpStore that conflicts with "delete db/") |
| Auth (dashboard→worker) | Server-side API Key proxy | Dashboard API Routes hold `BAT_API_KEY`, proxy to Worker; browser never calls Worker directly |
| UI system | Basalt design system | 3-tier luminance, shadcn/ui, Recharts, 24-color chart palette |
| Alerting | 6 Tier-1 rules, health endpoint | Uptime Kuma polls `GET /api/health` |
| Monorepo | pnpm workspaces + Cargo | TS packages managed by pnpm, Rust probe by Cargo |
| Deployment | CF Worker + D1, Dashboard on Railway | No GitHub CI needed |

## MVP Scope

- **Probe**: Tier 1 only (CPU, Memory, Disk, Network, Identity)
- **Worker**: Ingest, identity, metrics query API, health endpoint, hourly aggregation cron
- **Dashboard**: Host overview grid, host detail charts, alerts page, Google login
- **Alerts**: 6 Tier-1 rules only (CPU, Memory, Disk, IOWait, Steal, Offline)

---

## Monorepo Structure

```
bat/
├── probe/                          # Rust crate (Cargo, not pnpm)
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs                 # tokio main loop + shutdown
│   │   ├── config.rs               # TOML config parsing
│   │   ├── payload.rs              # Serde structs (mirror @bat/shared types)
│   │   ├── sender.rs               # HTTP POST + retry/backoff
│   │   ├── rate.rs                 # Counter → rate conversion (net)
│   │   └── collectors/
│   │       ├── mod.rs
│   │       ├── cpu.rs              # /proc/stat, /proc/loadavg, /proc/cpuinfo
│   │       ├── memory.rs           # /proc/meminfo
│   │       ├── disk.rs             # /proc/mounts + statvfs()
│   │       ├── network.rs          # /sys/class/net/*/statistics/*
│   │       └── identity.rs         # hostname, os-release, uname, uptime
│   └── dist/
│       └── bat-probe.service       # systemd unit file
├── packages/
│   ├── shared/                     # @bat/shared — TS types (single source of truth)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts            # barrel export
│   │       ├── metrics.ts          # MetricsPayload, CpuMetrics, etc.
│   │       ├── identity.ts         # IdentityPayload, HostRow
│   │       ├── alerts.ts           # AlertRule, AlertState, HealthResponse
│   │       ├── api.ts              # Route constants, request/response types
│   │       └── constants.ts        # Thresholds, intervals, retention days
│   ├── worker/                     # @bat/worker — CF Worker
│   │   ├── package.json
│   │   ├── wrangler.toml
│   │   ├── schema.sql              # D1 DDL
│   │   └── src/
│   │       ├── index.ts            # Hono app + cron scheduled handler
│   │       ├── types.ts            # Env bindings (DB, API_KEY, etc.)
│   │       ├── routes/
│   │       │   ├── ingest.ts       # POST /api/ingest
│   │       │   ├── identity.ts     # POST /api/identity
│   │       │   ├── hosts.ts        # GET /api/hosts, /api/hosts/:id/metrics
│   │       │   ├── alerts.ts       # GET /api/alerts (all active alerts)
│   │       │   └── health.ts       # GET /api/health, /api/health/:host_id
│   │       ├── services/
│   │       │   ├── metrics.ts      # insertRaw(), queryMetrics()
│   │       │   ├── alerts.ts       # evaluateAlerts(), 6 Tier-1 rules
│   │       │   └── aggregation.ts  # aggregateHour(), purgeOld()
│   │       └── middleware/
│   │           └── api-key.ts      # Bearer token validation
│   └── dashboard/                  # @bat/dashboard — Next.js 16 (from Surety)
│       ├── package.json
│       ├── next.config.ts
│       ├── Dockerfile              # Bun standalone 3-stage (from Surety)
│       └── src/
│           ├── auth.ts             # Google OAuth (from Surety)
│           ├── proxy.ts            # Auth guard (from Surety)
│           ├── app/
│           │   ├── layout.tsx      # Root layout + providers
│           │   ├── globals.css     # Basalt design tokens
│           │   ├── page.tsx        # → /hosts redirect
│           │   ├── login/page.tsx  # Google login (from Surety)
│           │   ├── api/            # Server-side proxy to Worker (holds BAT_API_KEY)
│           │   │   ├── hosts/
│           │   │   │   └── route.ts        # Proxy → Worker GET /api/hosts
│           │   │   ├── hosts/[id]/metrics/
│           │   │   │   └── route.ts        # Proxy → Worker GET /api/hosts/:id/metrics
│           │   │   └── alerts/
│           │   │       └── route.ts        # Proxy → Worker GET /api/alerts
│           │   ├── hosts/
│           │   │   ├── page.tsx    # Overview: host grid with status
│           │   │   └── [id]/
│           │   │       └── page.tsx # Host detail: charts + alerts
│           │   └── alerts/
│           │       └── page.tsx    # Active alerts across all hosts
│           ├── components/
│           │   ├── layout/         # AppShell, Sidebar (from Surety)
│           │   ├── ui/             # shadcn/ui (from Surety)
│           │   ├── host-card.tsx
│           │   ├── status-badge.tsx
│           │   └── charts/         # CPU, Memory, Disk, Network
│           └── lib/
│               ├── api.ts          # Fetch wrapper → Worker API
│               └── hooks/          # SWR hooks (hosts, metrics, alerts)
├── pnpm-workspace.yaml             # packages: ["packages/*"]
├── package.json                    # root scripts
├── turbo.json                      # build pipeline
└── biome.json                      # formatter + linter
```

---

## D1 Schema

```sql
-- Host identity
CREATE TABLE hosts (
  host_id    TEXT PRIMARY KEY,
  hostname   TEXT NOT NULL,
  os         TEXT,
  kernel     TEXT,
  arch       TEXT,
  cpu_model  TEXT,
  boot_time  INTEGER,
  last_seen  INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Raw metrics (7-day retention)
-- disk/net stored as JSON columns to avoid JOINs
CREATE TABLE metrics_raw (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  host_id         TEXT    NOT NULL,
  ts              INTEGER NOT NULL,
  cpu_load1       REAL,
  cpu_load5       REAL,
  cpu_load15      REAL,
  cpu_usage_pct   REAL,
  cpu_iowait      REAL,
  cpu_steal       REAL,
  cpu_count       INTEGER,
  mem_total       INTEGER,
  mem_available   INTEGER,
  mem_used_pct    REAL,
  swap_total      INTEGER,
  swap_used       INTEGER,
  swap_used_pct   REAL,
  disk_json       TEXT,
  net_json        TEXT,
  uptime_seconds  INTEGER,
  FOREIGN KEY (host_id) REFERENCES hosts(host_id)
);
CREATE INDEX idx_raw_host_ts ON metrics_raw(host_id, ts);

-- Hourly aggregated metrics (90-day retention)
CREATE TABLE metrics_hourly (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  host_id          TEXT    NOT NULL,
  hour_ts          INTEGER NOT NULL,
  sample_count     INTEGER NOT NULL,
  cpu_usage_avg    REAL,
  cpu_usage_max    REAL,
  cpu_iowait_avg   REAL,
  cpu_steal_avg    REAL,
  cpu_load1_avg    REAL,
  cpu_load5_avg    REAL,
  cpu_load15_avg   REAL,
  mem_used_pct_avg REAL,
  mem_used_pct_max REAL,
  swap_used_pct_avg REAL,
  uptime_min       INTEGER,
  disk_json        TEXT,
  net_json         TEXT,
  FOREIGN KEY (host_id) REFERENCES hosts(host_id),
  UNIQUE(host_id, hour_ts)
);
CREATE INDEX idx_hourly_host_ts ON metrics_hourly(host_id, hour_ts);

-- Active alerts
CREATE TABLE alert_states (
  host_id      TEXT NOT NULL,
  rule_id      TEXT NOT NULL,
  severity     TEXT NOT NULL CHECK(severity IN ('warning', 'critical')),
  value        REAL,
  triggered_at INTEGER NOT NULL,
  message      TEXT,
  PRIMARY KEY (host_id, rule_id),
  FOREIGN KEY (host_id) REFERENCES hosts(host_id)
);

-- Duration-based alert tracking (staging before promotion to alert_states)
CREATE TABLE alert_pending (
  host_id    TEXT NOT NULL,
  rule_id    TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_value REAL,
  PRIMARY KEY (host_id, rule_id)
);
```

**Design rationale**:
- `disk_json` / `net_json` as JSON text — Dashboard always fetches full array, D1 `json_extract()` handles rare per-mount queries
- `alert_pending` stages duration-based rules: condition first appears → track → promote to `alert_states` after sustained period
- `UNIQUE(host_id, hour_ts)` enables idempotent `INSERT OR REPLACE` for aggregation reruns

---

## Worker API

| Route | Auth | Method | Purpose |
|-------|------|--------|---------|
| `/api/ingest` | API Key | POST | Receive Tier-1 metrics, evaluate alerts |
| `/api/identity` | API Key | POST | Receive/update host identity |
| `/api/hosts` | API Key | GET | List all hosts with latest status |
| `/api/hosts/:id/metrics` | API Key | GET | Query metrics (`?from=&to=`, auto raw/hourly) |
| `/api/alerts` | API Key | GET | List all active alerts across all hosts |
| `/api/health` | Public | GET | Overall health (200/degraded/503) for Uptime Kuma |
| `/api/health/:host_id` | Public | GET | Per-host health |

All API Key routes use the same `Authorization: Bearer <key>` mechanism.
Probe and Dashboard server both use this key — Probe for writes, Dashboard for reads.

### Dashboard proxy architecture

Dashboard (Next.js) exposes its own `/api/*` routes to the browser. These routes:

1. Check the user's NextAuth session (Google OAuth cookie, same domain)
2. If authenticated, forward the request to Worker with `Authorization: Bearer <BAT_API_KEY>`
3. Return the Worker response to the browser

```
Browser ──cookie──→ Dashboard /api/hosts ──API Key──→ Worker /api/hosts ──→ D1
                    (session check)         (server-side, no CORS)
```

This means:
- Browser never needs to know the Worker URL or API Key
- No cross-domain cookie issues
- Worker auth stays simple (single API Key middleware for everything)
- Dashboard API Routes are thin proxies, no business logic

### Ingest critical path

Single Worker invocation, D1 batch for atomicity:

1. Validate payload shape (lightweight check, no Zod)
2. `INSERT INTO metrics_raw` — flatten scalars, stringify disk/net
3. `UPDATE hosts SET last_seen = ?`
4. `evaluateAlerts(payload)` → UPSERT `alert_states` / `alert_pending`
5. Return `204 No Content`

### Alert rules (6 Tier-1 only for MVP)

| Rule ID | Field | Condition | Severity | Duration |
|---------|-------|-----------|----------|----------|
| `cpu_high` | `cpu.usage_pct` | > 90 | critical | 5 min |
| `mem_warning` | `mem.used_pct` | > 90 / > 95 | warning / critical | instant |
| `disk_full` | `disk.*.used_pct` | > 85 / > 95 | warning / critical | instant |
| `iowait_high` | `cpu.iowait_pct` | > 20 | warning | 5 min |
| `steal_high` | `cpu.steal_pct` | > 10 | warning | 5 min |
| `host_offline` | `hosts.last_seen` | > 120s ago | critical | query-time |

**Alert evaluation**:
- **Instant rules** (mem, disk): threshold exceeded → fire immediately
- **Duration rules** (cpu, iowait, steal): track in `alert_pending`, fire after sustained N seconds
- **Offline detection**: NOT during ingest — evaluated at health endpoint query time

### Health endpoint response

```json
{
  "status": "degraded",
  "hosts": {
    "jp.nocoo.cloud": { "status": "healthy", "alerts": [] },
    "us.nocoo.cloud": {
      "status": "warning",
      "alerts": [{ "rule_id": "iowait_high", "severity": "warning", "value": 25.1 }]
    },
    "us2.nocoo.cloud": {
      "status": "critical",
      "alerts": [{ "rule_id": "cpu_high", "severity": "critical", "value": 92.3 }]
    }
  },
  "checked_at": 1742025600
}
```

**HTTP status code logic** (three-level):
- `200` — all hosts healthy, OR only `warning` alerts active → `"status": "healthy"` or `"degraded"`
- `503` — any `critical` alert active → `"status": "critical"`

This prevents warning-level alerts (disk > 85%, iowait > 20%) from triggering Uptime Kuma's downtime notification. Only critical conditions (CPU > 90% sustained, memory > 95%, disk > 95%, host offline) produce a 503.

**Overall status derivation**: `critical` if any host critical → `degraded` if any host warning → `healthy` otherwise.

### Hourly aggregation cron

- Cron Trigger: `0 * * * *`
- Aggregate previous complete hour → `INSERT OR REPLACE INTO metrics_hourly` (avg/max scalars, last sample disk/net JSON)
- Purge `metrics_raw WHERE ts < now - 7d`
- Purge `metrics_hourly WHERE hour_ts < now - 90d`

---

## Rust Probe

### Config (`/etc/bat/config.toml`)

```toml
worker_url = "https://bat-worker.your.workers.dev"
api_key = "your-api-key"
host_id = "jp.nocoo.cloud"    # optional, defaults to hostname
interval = 30                  # seconds

[disk]
exclude_mounts = ["/boot/efi", "/snap"]
exclude_fs_types = ["tmpfs", "devtmpfs", "squashfs"]
# NOTE: overlay is NOT excluded — per 01-probe-metrics-spec.md it is a real
# filesystem used by Docker. Docker hosts need overlay mounts visible.
# Individual noisy mounts can be excluded via exclude_mounts instead.

[network]
exclude_interfaces = ["lo", "docker0"]
```

### Collectors

All Tier-1 collectors read procfs/sysfs directly — zero process fork, zero root required:

| Collector | Source | Notes |
|-----------|--------|-------|
| CPU | `/proc/stat`, `/proc/loadavg` | Delta method: two samples, diff idle/total jiffies |
| Memory | `/proc/meminfo` | Parse MemTotal, MemAvailable, SwapTotal, SwapFree |
| Disk | `/proc/mounts` + `statvfs()` | Filter by fs type, exclude configured mounts |
| Network | `/sys/class/net/*/statistics/*` | Counter → rate (bytes/sec), handle u32 wrap |
| Identity | `/etc/hostname`, `/etc/os-release`, `/proc/version`, `/proc/uptime` | Sent on startup + every 6h |

### Main loop

```
startup → load config → build HTTP client → send identity

# Seed phase: read cpu/net counters once to establish baseline.
# Do NOT report — these raw counters have no meaningful delta yet.
seed_cpu()   → store prev jiffies
seed_net()   → store prev byte counters
wait 30s     → first interval elapses

# Normal loop: every tick has a valid prev sample to diff against
loop {
  select {
    tick(30s) → collect_all() → POST /api/ingest
                 - cpu/net deltas are now "past 30s", not "since boot"
                 - retry 5x, exponential backoff 1s→60s
                 - 401 → log error, don't retry (bad key)
               if 6h elapsed → resend identity
    SIGTERM/SIGINT → graceful shutdown
  }
}
```

- `tokio::main(flavor = "current_thread")` — single-threaded, minimal RSS
- **Critical**: The seed phase consumes one interval without reporting. The first actual POST happens ~30s after startup. This ensures CPU usage% and network rates reflect the real 30s window, not cumulative-since-boot values that would pollute charts and trigger false alerts.

### Dependencies (Cargo.toml)

```toml
[dependencies]
tokio = { version = "1", features = ["rt", "time", "signal", "macros"] }
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "json"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
toml = "0.8"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

[profile.release]
opt-level = "z"
lto = true
strip = true
codegen-units = 1
```

No `sysinfo` crate — direct procfs/sysfs parsing for minimal binary size.

### Cross-compile targets

- `x86_64-unknown-linux-musl` (most VPS)
- `aarch64-unknown-linux-musl` (ARM VPS)

### Systemd unit (`probe/dist/bat-probe.service`)

```ini
[Unit]
Description=bat VPS monitoring probe
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/bat-probe
Restart=always
RestartSec=5
MemoryMax=15M

[Install]
WantedBy=multi-user.target
```

---

## Dashboard (from Surety Template)

### Bootstrap from `../surety`

**Direct copy** (change nav items / branding only):
- `src/auth.ts` — Google OAuth + email allowlist (**strip TOTP references**: remove `isTotpEnabled()` / `consumeNonce()` callbacks; Surety's TOTP depends on `@/lib/totp` which requires a DB-backed `TotpStore` + `TOTP_MASTER_KEY` / `TOTP_HMAC_SECRET` env vars — not worth porting for a single-user monitoring dashboard)
- `src/proxy.ts` + `src/lib/proxy-logic.ts` — auth guard (remove TOTP redirect logic, keep session check only)
- `src/components/layout/*` — AppShell, Sidebar
- `src/components/ui/*` — all shadcn/ui components
- `src/app/globals.css` — Basalt design tokens
- `src/app/login/page.tsx` — login page
- `Dockerfile` — Bun standalone 3-stage build

**Remove**: `db/` (Drizzle/SQLite), `repositories/`, `lib/totp/` (TOTP 2FA module), insurance-specific pages, `services/backy.ts`

### Pages

| Route | Description |
|-------|-------------|
| `/` | Redirect to `/hosts` |
| `/login` | Google OAuth login (from Surety) |
| `/hosts` | Overview grid: per-host cards with status badge, CPU%, MEM%, uptime |
| `/hosts/[id]` | Detail: time-series charts (CPU, Memory, Network), disk bars, system info, active alerts |
| `/alerts` | All active alerts across hosts |

### Data fetching

- `lib/api.ts` — fetch wrapper, calls Dashboard's own `/api/*` proxy routes (NOT Worker directly)
- Dashboard API Routes (`src/app/api/`) proxy to Worker server-side with `BAT_API_KEY`
- SWR hooks with 30s refresh for live view
- Time range picker: 1h/6h/24h (raw data) → 7d/30d/90d (hourly auto-switch)

### Charts (Recharts, Basalt palette)

- CPU line chart: usage%, iowait%, steal%
- Memory area chart: used% with threshold line
- Network dual-axis: rx/tx bytes/sec
- Disk horizontal bars: per-mount used%
- Load average sparklines

Reference: Basalt's `NetworkOpsDashboardPage` for widget patterns.

---

## Four-Layer Testing Strategy

### Layer definitions

| Layer | What | Tools | Trigger | Target |
|-------|------|-------|---------|--------|
| L1 — UT | Unit tests for pure logic | Bun test (TS), `cargo test` (Rust) | pre-commit | 90%+ coverage |
| L2 — Lint | Code quality, zero warnings | Biome (TS), `cargo clippy` (Rust) | pre-commit | 0 errors, 0 warnings |
| L3 — API E2E | 100% of Worker API routes | Bun test + local Wrangler | pre-push | All routes covered |
| L4 — BDD E2E | Core user flows in Dashboard | Playwright (Chromium) | On-demand | Login → overview → detail → alerts |

### L1 — Unit Tests

**Shared types (`packages/shared/`)**:
- Alert rule evaluation logic (threshold checks, duration tracking)
- Payload validation helpers

**Worker (`packages/worker/`)**:
- `services/alerts.ts` — alert evaluation with mock payloads (instant + duration rules, clear conditions)
- `services/aggregation.ts` — aggregation SQL correctness
- `services/metrics.ts` — raw/hourly resolution auto-selection
- `middleware/api-key.ts` — accept valid, reject invalid/missing

**Probe (`probe/`)**:
- `collectors/cpu.rs` — parse `/proc/stat` fixture, delta calculation
- `collectors/memory.rs` — parse `/proc/meminfo` fixture
- `collectors/disk.rs` — mount filtering logic
- `collectors/network.rs` — rate calculation, counter wrap handling
- `config.rs` — TOML parsing, defaults
- `rate.rs` — counter diff math

**Dashboard (`packages/dashboard/`)**:
- ViewModel functions (data transformation, chart data preparation)
- `lib/proxy-logic.ts` — route decision table (from Surety pattern)

### L2 — Lint

- **TypeScript**: Biome strict mode (`biome.json`), zero errors + zero warnings
- **Rust**: `cargo clippy -- -D warnings` (deny all warnings)
- Both run in pre-commit hook via Husky

### L3 — API E2E

Test every Worker route against local Wrangler dev server:

| Test | Route | Validates |
|------|-------|-----------|
| Ingest valid payload | `POST /api/ingest` | 204, data in D1 |
| Ingest missing API key | `POST /api/ingest` | 401 |
| Ingest invalid payload | `POST /api/ingest` | 400 |
| Send identity | `POST /api/identity` | 204, host in D1 |
| List hosts | `GET /api/hosts` | Returns registered hosts |
| Query raw metrics | `GET /api/hosts/:id/metrics?from=&to=` | Correct count, raw resolution |
| Query hourly metrics | `GET /api/hosts/:id/metrics?from=&to=` | Hourly resolution for > 24h range |
| Health all healthy | `GET /api/health` | 200, all hosts healthy |
| Health with warning only | `GET /api/health` | 200, status "degraded", no 503 |
| Health with critical | `GET /api/health` | 503, critical alert details |
| Health per host | `GET /api/health/:id` | Per-host status |
| Offline detection | `GET /api/health` | Host with old `last_seen` → offline (503) |
| List all alerts | `GET /api/alerts` | Returns active alerts across hosts |
| Aggregation cron | `__scheduled` trigger | `metrics_hourly` populated, raw purged |
| Unauthenticated API | `GET /api/hosts` (no API key) | 401 |

**Server convention**: Worker dev on port 8787, API E2E on port 18787.

### L4 — BDD E2E (Playwright)

Core flows:

| Flow | Steps |
|------|-------|
| Login | Navigate → Google OAuth → redirect to `/hosts` |
| Overview | See all hosts → status badges correct → click host |
| Host detail | Charts render → time range picker works → system info visible |
| Alerts | Navigate to `/alerts` → active alerts shown → link to host detail |

**Server convention**: BDD E2E dev server on port 28787.
**Auth bypass**: `E2E_SKIP_AUTH=1` environment variable (same pattern as Surety).

### Husky hooks

```
pre-commit:
  - pnpm turbo typecheck
  - pnpm biome check .
  - pnpm --filter @bat/shared test -- --coverage (≥ 90%)
  - pnpm --filter @bat/worker test -- --coverage (≥ 90%)
  - pnpm --filter @bat/dashboard test -- --coverage (≥ 90%)
  - cd probe && cargo clippy -- -D warnings && cargo test

pre-push:
  - pnpm --filter @bat/worker test:e2e (API E2E against local Wrangler)
```

---

## Atomic Commits Plan

### Phase 0 — Scaffolding

| # | Commit | Files | Verify |
|---|--------|-------|--------|
| 0.1 | `chore: init monorepo with pnpm workspaces` | `pnpm-workspace.yaml`, root `package.json`, `turbo.json`, `biome.json`, `.gitignore` | `pnpm install` succeeds |
| 0.2 | `chore: scaffold shared types package` | `packages/shared/**` | `pnpm turbo build --filter=@bat/shared` |
| 0.3 | `chore: scaffold worker package` | `packages/worker/package.json`, `wrangler.toml`, `src/index.ts` (hello world) | `pnpm --filter @bat/worker dev` returns 200 |
| 0.4 | `chore: scaffold probe crate` | `probe/Cargo.toml`, `probe/src/main.rs` (hello world) | `cargo build --release` |
| 0.5 | `chore: scaffold dashboard from surety template` | `packages/dashboard/**` (copy + clean) | `pnpm --filter @bat/dashboard dev` starts |
| 0.6 | `chore: setup husky pre-commit and pre-push hooks` | `.husky/`, `scripts/check-coverage.sh` | `git commit` runs hooks |

### Phase 1 — Shared Types

| # | Commit | Files | Verify |
|---|--------|-------|--------|
| 1.1 | `feat: add metrics payload types` | `packages/shared/src/metrics.ts` | Typecheck passes |
| 1.2 | `feat: add identity payload types` | `packages/shared/src/identity.ts` | Typecheck passes |
| 1.3 | `feat: add alert types and 6 tier-1 rules` | `packages/shared/src/alerts.ts`, `constants.ts` | Typecheck passes |
| 1.4 | `feat: add api route types and constants` | `packages/shared/src/api.ts`, `index.ts` | Build + typecheck |
| 1.5 | `test: add unit tests for alert rule definitions` | `packages/shared/src/__tests__/alerts.test.ts` | `bun test` passes |

### Phase 2 — Worker + D1

| # | Commit | Files | Verify |
|---|--------|-------|--------|
| 2.1 | `feat: add d1 schema` | `packages/worker/schema.sql` | `wrangler d1 execute --local --file=schema.sql` |
| 2.2 | `feat: add api key auth middleware` | `middleware/api-key.ts` | UT: valid/invalid/missing key |
| 2.3 | `feat: add identity route` | `routes/identity.ts`, `services/metrics.ts` | UT + manual curl |
| 2.4 | `feat: add ingest route` | `routes/ingest.ts` | UT + manual curl → 204 |
| 2.5 | `feat: add alert evaluation service` | `services/alerts.ts` | UT: all 6 rules, instant + duration |
| 2.6 | `feat: wire alert evaluation into ingest` | `routes/ingest.ts` | UT: ingest triggers alert state changes |
| 2.7 | `feat: add hosts list route` | `routes/hosts.ts` | UT: returns registered hosts |
| 2.8 | `feat: add metrics query route with auto resolution` | `routes/hosts.ts` | UT: raw vs hourly selection |
| 2.9 | `feat: add health endpoint with warning/critical distinction` | `routes/health.ts` | UT: 200 (healthy/warning-only), 503 (critical), offline detection |
| 2.10 | `feat: add alerts list route` | `routes/alerts.ts` | UT: returns all active alerts across hosts |
| 2.11 | `feat: add hourly aggregation cron` | `services/aggregation.ts`, `index.ts` scheduled handler | UT: aggregate + purge logic |
| 2.12 | `test: add api e2e tests for all worker routes` | `packages/worker/test/e2e/**` | All routes pass against local Wrangler |

### Phase 3 — Rust Probe

| # | Commit | Files | Verify |
|---|--------|-------|--------|
| 3.1 | `feat: add config parsing` | `config.rs` | `cargo test` — parse valid/invalid TOML |
| 3.2 | `feat: add payload structs` | `payload.rs` | `cargo test` — serialize to expected JSON |
| 3.3 | `feat: add cpu collector` | `collectors/cpu.rs` | `cargo test` — parse fixture, delta calc |
| 3.4 | `feat: add memory collector` | `collectors/memory.rs` | `cargo test` — parse fixture |
| 3.5 | `feat: add disk collector` | `collectors/disk.rs` | `cargo test` — mount filtering |
| 3.6 | `feat: add network collector with rate calc` | `collectors/network.rs`, `rate.rs` | `cargo test` — rate calc, wrap handling |
| 3.7 | `feat: add identity collector` | `collectors/identity.rs` | `cargo test` — parse fixtures |
| 3.8 | `feat: add http sender with retry backoff` | `sender.rs` | `cargo test` — retry logic |
| 3.9 | `feat: add main loop with graceful shutdown` | `main.rs` | `cargo build --release`, binary < 10MB |
| 3.10 | `chore: add systemd unit file` | `dist/bat-probe.service` | Validate syntax |
| 3.11 | `test: integration test probe against local worker` | Manual test | Metrics appear in D1, health endpoint reflects data |

### Phase 4 — Dashboard

| # | Commit | Files | Verify |
|---|--------|-------|--------|
| 4.1 | `feat: add api proxy routes to worker` | `app/api/hosts/route.ts`, `app/api/alerts/route.ts`, etc. | UT: proxy forwards with API key, rejects unauthenticated |
| 4.2 | `feat: add api client and swr hooks` | `lib/api.ts`, `lib/hooks/*` | UT: fetch wrapper, mock responses |
| 4.3 | `feat: add host card and status badge components` | `components/host-card.tsx`, `status-badge.tsx` | UT: render with mock data |
| 4.4 | `feat: add hosts overview page` | `app/hosts/page.tsx` | Dev server: grid renders |
| 4.5 | `feat: add chart components` | `components/charts/*` | UT: data transformation |
| 4.6 | `feat: add host detail page with charts` | `app/hosts/[id]/page.tsx` | Dev server: charts render |
| 4.7 | `feat: add alerts page` | `app/alerts/page.tsx`, `components/alert-table.tsx` | Dev server: alerts render |
| 4.8 | `feat: configure sidebar navigation` | `components/layout/sidebar.tsx` | Nav items correct |
| 4.9 | `test: add bdd e2e tests for core flows` | `e2e/**` | Playwright: login → overview → detail → alerts |

### Phase 5 — Deployment

| # | Commit | Files | Verify |
|---|--------|-------|--------|
| 5.1 | `chore: configure worker production deployment` | `wrangler.toml` (production D1 ID, secrets) | `wrangler deploy` succeeds |
| 5.2 | `chore: configure dashboard dockerfile` | `Dockerfile`, `docker-compose.yml` | `docker build` + `docker run` on Railway |
| 5.3 | `docs: update readme with project overview` | `README.md` | Links to docs work |

---

## Deployment

### CF Worker + D1

```bash
# Create D1 database
wrangler d1 create bat-db

# Set secrets
wrangler secret put BAT_API_KEY

# Apply schema
wrangler d1 execute bat-db --file=packages/worker/schema.sql

# Deploy
cd packages/worker && wrangler deploy
```

### Dashboard on Railway

- Connect GitHub repo, set root directory to `packages/dashboard`
- Dockerfile deployment (Bun standalone)
- Environment variables:
  - `BAT_API_URL` — Worker URL
  - `BAT_API_KEY` — Shared API Key (same key used by Probe; Dashboard proxy uses it to call Worker)
  - `AUTH_SECRET` — NextAuth secret
  - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth (matches Surety's `auth.ts` env names)
  - `ALLOWED_EMAILS` — email allowlist
  - `USE_SECURE_COOKIES=true`

### Probe on VPS

```bash
# Copy binary
scp bat-probe root@vps:/usr/local/bin/

# Copy config
scp config.toml root@vps:/etc/bat/config.toml

# Copy systemd unit
scp bat-probe.service root@vps:/etc/systemd/system/

# Enable and start
ssh root@vps "systemctl daemon-reload && systemctl enable --now bat-probe"
```

---

## Verification Checklist

### End-to-end flow

1. Probe running on VPS → sends metrics every 30s
2. Worker receives, stores in D1, evaluates alerts
3. `curl /api/health` → returns host status (200 for healthy/warning, 503 for critical)
4. Uptime Kuma monitors health endpoint → alerts only on 503 (critical), not on warning
5. Dashboard shows live host grid, charts update every 30s
6. Login with Google → only allowed emails can access

### Resource budget

| Metric | Target | How to verify |
|--------|--------|---------------|
| Probe RSS | < 15 MB | `cat /proc/$(pidof bat-probe)/status \| grep VmRSS` |
| Probe binary | < 10 MB | `ls -lh bat-probe` |
| Probe CPU | < 0.1% idle | `top -p $(pidof bat-probe)` |
| Network per probe | ~3 KB/min | `tcpdump` sample |
| Worker latency | < 50ms ingest | Wrangler logs |
| D1 rows/day | ~17,280 (6 hosts × 2/min × 1440 min) | `SELECT COUNT(*) FROM metrics_raw` |
