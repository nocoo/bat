# 02 — System Architecture

> High-level design, key decisions, MVP scope, monorepo structure, and deployment plan.
> Prerequisite: [01-metrics-catalogue.md](./01-metrics-catalogue.md)
>
> Related documents:
> - [03-data-structures.md](./03-data-structures.md) — D1 schema, migration strategy, payload types, alert rules
> - [04-probe.md](./04-probe.md) — Rust probe implementation
> - [05-worker.md](./05-worker.md) — CF Worker routes, ingest, alerts, health endpoint
> - [06-dashboard.md](./06-dashboard.md) — Next.js dashboard, Google OAuth, proxy architecture
> - [07-testing.md](./07-testing.md) — Four-layer testing strategy, Husky hooks
> - [08-commits.md](./08-commits.md) — Atomic commits plan (Phase 0–5)

## Overview

Replace Netdata (120-243MB RSS) across 6 VPS hosts with a purpose-built monitoring system.

```
┌─────────────┐    HTTPS POST     ┌─────────────┐        ┌──────┐
│  Rust Probe  │ ───────────────→ │  CF Worker   │ ─────→ │  D1  │
│  (per VPS)   │   JSON + API Key │  (Hono)      │        │      │
└─────────────┘                   └──────┬───────┘        └──┬───┘
                                         │                   │
                              GET /api/health         API Key │ D1 REST API
                                         │                   │ (direct)
                                  ┌──────▼───────┐   ┌──────▼───────┐
                                  │ Uptime Kuma  │   │  Dashboard   │
                                  │ (existing)   │   │  Next.js 16  │
                                  └──────────────┘   │  Railway     │
                                                     └──────────────┘

Dashboard has one data path:
  1. Proxy path: Dashboard /api/* → Worker /api/* (BAT_READ_KEY / BAT_WRITE_KEY) for all data

Dashboard auth model:
  - User authenticates with Google OAuth on Dashboard (cookie stays on Dashboard domain)
  - Dashboard API Routes (Next.js /api/*) act as a server-side proxy to Worker for all data
  - Dashboard server holds BAT_READ_KEY (for reads) and BAT_WRITE_KEY (for mutations)
  - Browser never talks to Worker or D1 directly — no cross-domain cookie issue
```

### Data flow summary

1. **Probe → Worker** (write path): Probe POSTs metrics/identity JSON with `BAT_WRITE_KEY`. Worker validates, stores in D1, evaluates alert rules. See [04-probe.md](./04-probe.md) for Probe internals, [05-worker.md](./05-worker.md) for Worker ingest logic.
2. **Dashboard → Worker** (read path): Dashboard API Routes proxy browser requests to Worker with `BAT_READ_KEY` or `BAT_WRITE_KEY` (for mutations). Worker queries D1, returns JSON. See [06-dashboard.md](./06-dashboard.md) for proxy architecture.
3. **Uptime Kuma → Worker** (health path): Public `GET /api/health` returns aggregate status (200/503). No API key required. See [05-worker.md § Health endpoint](./05-worker.md).

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Probe language | Rust | Single static binary, < 15MB RSS, < 10MB disk |
| Transport | HTTPS POST JSON | CF Worker native, ~1KB/report, simple |
| Auth (probe→worker) | Write API Key | `Authorization: Bearer <BAT_WRITE_KEY>`, stored as Worker secret. Only accepted on write routes (`/api/ingest`, `/api/identity`) |
| Auth (dashboard→worker) | Read/Write API Key proxy | Dashboard API Routes hold `BAT_READ_KEY` and `BAT_WRITE_KEY`, proxy to Worker. Read key for read routes, write key for mutations (tags, maintenance, webhooks, port allowlist) |
| Server | CF Worker + D1 | Serverless, free tier sufficient for 6 hosts |
| Data retention | 7d raw + 90d hourly | ~17K rows/day raw, hourly cron aggregates + purges. Schema details in [03-data-structures.md](./03-data-structures.md) |
| Dashboard | Next.js 16 + Bun (from Surety template) | Clone auth, UI, deployment from `../surety`. Details in [06-dashboard.md](./06-dashboard.md) |
| Auth (dashboard) | Google OAuth + email allowlist | From Surety (`src/auth.ts`, `src/proxy.ts`); TOTP 2FA dropped for MVP (requires DB-backed TotpStore that conflicts with "delete db/") |
| UI system | Basalt design system | 3-tier luminance, shadcn/ui, Recharts, 24-color chart palette |
| Alerting | 6 Tier-1 rules, health endpoint | Uptime Kuma polls `GET /api/health`. Rules defined in [03-data-structures.md](./03-data-structures.md) |
| Monorepo | pnpm workspaces + Cargo | TS packages managed by pnpm, Rust probe by Cargo |
| Deployment | CF Worker + D1, Dashboard on Railway | No GitHub CI needed |

---

## MVP Scope

- **Probe**: Tier 1 only (CPU, Memory, Disk, Network, Identity) — [04-probe.md](./04-probe.md)
- **Worker**: Ingest, identity, metrics query API, health endpoint, hourly aggregation cron — [05-worker.md](./05-worker.md)
- **Dashboard**: Host overview grid, host detail charts, alerts page, Google login — [06-dashboard.md](./06-dashboard.md)
- **Alerts**: 6 Tier-1 rules (see [03-data-structures.md § Alert rules](./03-data-structures.md))

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
│   │   ├── migrations/             # D1 migrations (sequential, numbered)
│   │   │   └── 0001_initial.sql    # Initial schema DDL
│   │   └── src/
│   │       ├── index.ts            # Hono app + cron scheduled handler
│   │       ├── types.ts            # Env bindings (DB, API_KEY, etc.)
│   │       ├── routes/
│   │       │   ├── ingest.ts       # POST /api/ingest
│   │       │   ├── identity.ts     # POST /api/identity
│   │       │   ├── hosts.ts        # GET /api/hosts, /api/hosts/:id, /api/hosts/:id/metrics
│   │       │   ├── alerts.ts       # GET /api/alerts (all active alerts)
│   │       │   ├── health.ts       # GET /api/health (aggregate only)
│   │       │   ├── host-detail.ts  # GET /api/hosts/:id (single host detail)
│   │       │   ├── tier2-ingest.ts # POST /api/tier2 (Tier 2 payload)
│   │       │   └── tier2-read.ts   # GET /api/hosts/:id/tier2 (latest Tier 2 snapshot)
│   │       ├── services/
│   │       │   ├── metrics.ts      # insertRaw(), queryMetrics()
│   │       │   ├── alerts.ts       # evaluateAlerts(), 6 Tier-1 rules
│   │       │   ├── status.ts       # deriveHostStatus() — shared by hosts + health routes
│   │       │   └── aggregation.ts  # aggregateHour(), purgeOld()
│   │       └── middleware/
│   │           └── api-key.ts      # Read/write key validation (route-scoped)
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
│           │   ├── api/            # Server-side proxy routes (all go through Worker)
│           │   │   ├── hosts/
│           │   │   │   └── route.ts        # Proxy → Worker GET /api/hosts
│           │   │   ├── hosts/[id]/
│           │   │   │   └── route.ts        # Proxy → Worker GET /api/hosts/:id
│           │   │   ├── hosts/[id]/metrics/
│           │   │   │   └── route.ts        # Proxy → Worker GET /api/hosts/:id/metrics
│           │   │   ├── hosts/[id]/tier2/
│           │   │   │   └── route.ts        # Proxy → Worker GET /api/hosts/:id/tier2
│           │   │   ├── hosts/[id]/tags/
│           │   │   │   └── route.ts        # Proxy → Worker GET/POST/PUT host tags
│           │   │   ├── hosts/[id]/tags/[tagId]/
│           │   │   │   └── route.ts        # Proxy → Worker DELETE tag from host
│           │   │   ├── alerts/
│           │   │   │   └── route.ts        # Proxy → Worker GET /api/alerts
│           │   │   ├── tags/
│           │   │   │   └── route.ts        # Proxy → Worker GET/POST tags
│           │   │   ├── tags/[id]/
│           │   │   │   └── route.ts        # Proxy → Worker PUT/DELETE tag
│           │   │   └── tags/by-hosts/
│           │   │       └── route.ts        # Proxy → Worker GET all host→tag mappings
│           │   ├── hosts/
│           │   │   ├── page.tsx    # Overview: host grid with status
│           │   │   └── [id]/
│           │   │       └── page.tsx # Host detail: charts + alerts + tier2 info
│           │   ├── alerts/
│           │   │   └── page.tsx    # Active alerts across all hosts
│           │   ├── tags/
│           │   │   └── page.tsx    # Tags management page
│           │   └── setup/
│           │       └── page.tsx    # Probe setup: install command
│           ├── components/
│           │   ├── layout/         # AppShell, Sidebar (from Surety)
│           │   ├── ui/             # shadcn/ui (from Surety)
│           │   ├── host-card.tsx
│           │   ├── status-badge.tsx
│           │   └── charts/         # CPU, Memory, Disk, Network
│           └── lib/
│               ├── api.ts          # Fetch wrapper → Dashboard's own /api/* proxy routes
│               ├── d1.ts           # Cloudflare D1 REST API client (for tags, user-state)
│               └── hooks/          # SWR hooks (hosts, metrics, alerts)
├── pnpm-workspace.yaml             # packages: ["packages/*"]
├── package.json                    # root scripts
├── turbo.json                      # build pipeline
└── biome.json                      # formatter + linter
```

---

## Auth Model

### Two API keys, two scopes

Two separate API keys stored as Worker secrets:

- `BAT_WRITE_KEY` — used by Probe for `POST /api/ingest` and `POST /api/identity`
- `BAT_READ_KEY` — used by Dashboard proxy for `GET` routes (`/api/hosts`, `/api/hosts/:id/metrics`, `/api/alerts`)

Worker middleware checks `Authorization: Bearer <key>` and matches against the appropriate secret based on HTTP method + route. Key scope isolation ensures that the read key cannot forge metrics or manipulate alerts.

### Dashboard proxy pattern

Dashboard (Next.js) exposes its own `/api/*` routes to the browser. These routes serve two purposes:

**1. Worker proxy** (all routes): Dashboard API routes forward requests to Worker with API key (read or write).

All paths require an authenticated NextAuth session:

1. Check the user's NextAuth session (Google OAuth cookie, same domain)
2. If authenticated:
   - **Read routes**: forward to Worker with `Authorization: Bearer <BAT_READ_KEY>`
   - **Write routes**: forward to Worker with `Authorization: Bearer <BAT_WRITE_KEY>`
3. Return response to browser

```
Worker proxy:  Browser ──cookie──→ Dashboard /api/* ──API Key──→ Worker /api/* ──→ D1
                                   (session check)    (server-side, no CORS)
```

This means:
- Browser never needs to know the Worker URL, D1 endpoint, or any API key
- No cross-domain cookie issues
- Worker auth stays simple (one middleware handles both keys, scoped by route: write key for POST, read key for GET)
- Dashboard owns user-state mutations (tags) independently of Worker, keeping the Worker's attack surface unchanged

---

## Deployment

### CF Worker + D1

```bash
# Create D1 database
wrangler d1 create bat-db

# Set secrets (two separate keys)
wrangler secret put BAT_WRITE_KEY
wrangler secret put BAT_READ_KEY

# Apply migrations (run each unapplied file in order)
wrangler d1 execute bat-db --file=packages/worker/migrations/0001_initial.sql

# Deploy
cd packages/worker && wrangler deploy
```

### Dashboard on Railway

- Connect GitHub repo, set root directory to `packages/dashboard`
- Dockerfile deployment (Bun standalone)
- Environment variables:
  - `BAT_API_URL` — Worker URL
  - `BAT_READ_KEY` — Read-only API Key for Worker
  - `BAT_WRITE_KEY` — Write API Key (used by Dashboard write proxy routes for webhook CRUD, maintenance CRUD, tags, port allowlist; also by setup page to generate install commands)
  - `AUTH_SECRET` — NextAuth secret
  - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth (matches Surety's `auth.ts` env names)
  - `ALLOWED_EMAILS` — email allowlist
  - `USE_SECURE_COOKIES=true`

### Probe on VPS (first-time install)

```bash
# 1. Create dedicated user (no home dir, no login shell)
ssh root@vps "useradd --system --no-create-home --shell /usr/sbin/nologin bat"

# 2. Create config directory
ssh root@vps "mkdir -p /etc/bat"

# 3. Copy binary and set permissions
scp bat-probe root@vps:/usr/local/bin/
ssh root@vps "chmod 755 /usr/local/bin/bat-probe"

# 4. Copy config (edit worker_url and write_key first!)
scp config.toml root@vps:/etc/bat/config.toml
ssh root@vps "chmod 640 /etc/bat/config.toml && chown root:bat /etc/bat/config.toml"

# 5. Copy systemd unit
scp bat-probe.service root@vps:/etc/systemd/system/

# 6. Enable and start
ssh root@vps "systemctl daemon-reload && systemctl enable --now bat-probe"

# 7. Verify
ssh root@vps "systemctl status bat-probe && journalctl -u bat-probe -n 10"
```

### Probe update (binary only)

```bash
scp bat-probe root@vps:/usr/local/bin/
ssh root@vps "systemctl restart bat-probe"
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
