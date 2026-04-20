# 02 — System Architecture

> High-level design, key decisions, monorepo structure, and deployment plan.
> Prerequisite: [01-metrics-catalogue.md](./01-metrics-catalogue.md)
>
> Related documents:
> - [03-data-structures.md](./03-data-structures.md) — D1 schema, migration strategy, payload types, alert rules
> - [04-probe.md](./04-probe.md) — Rust probe implementation
> - [05-worker.md](./05-worker.md) — CF Worker routes, ingest, alerts, health endpoint
> - [06-ui.md](./06-ui.md) — Vite + React SPA, Cloudflare Access auth
> - [07-testing.md](./07-testing.md) — Six-dimension quality system, Husky hooks

## Overview

Replace Netdata (120-243MB RSS) across VPS hosts with a purpose-built monitoring system.

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

### Dual-entry authentication

- **`bat.hexly.ai`** — Browser entry. Cloudflare Access enforces login (email allowlist). Worker validates `Cf-Access-Jwt-Assertion` header on browser-facing API routes.
- **`bat-ingest.worker.hexly.ai`** — Machine entry. No Access protection. Probe writes use `BAT_WRITE_KEY`, monitoring reads use `BAT_READ_KEY`.

### Data flow summary

1. **Probe → Worker** (write path): Probe POSTs metrics/identity JSON with `BAT_WRITE_KEY`. Worker validates, stores in D1, evaluates alert rules. See [04-probe.md](./04-probe.md).
2. **Browser → Worker** (read path): SPA fetches `/api/*` directly. Cloudflare Access JWT provides authentication. No proxy layer — browser talks to Worker at edge. See [06-ui.md](./06-ui.md).
3. **Uptime Kuma → Worker** (monitoring path): `GET /api/monitoring/*` endpoints with `BAT_READ_KEY`. `GET /api/live` is public (health check). See [16-monitoring-api.md](./16-monitoring-api.md).

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Probe language | Rust | Single static binary, < 15MB RSS, < 10MB disk |
| Transport | HTTPS POST JSON | CF Worker native, ~1KB/report, simple |
| Auth (probe→worker) | BAT_WRITE_KEY | `Authorization: Bearer` on write routes only |
| Auth (browser) | Cloudflare Access | Zero-trust, email allowlist, JWT verification at edge |
| Auth (monitoring) | BAT_READ_KEY | `Authorization: Bearer` for machine read routes |
| Server | CF Worker (Hono) + D1 | Single Worker serves API + SPA static assets |
| Data retention | 7d raw + 90d hourly | ~17K rows/day raw, hourly cron aggregates + purges |
| UI | Vite + React SPA | Built into Worker static assets, served at edge |
| Design system | Basalt | 3-tier luminance, shadcn/ui, Recharts, 24-color chart palette |
| Alerting | Tier 1/2/3 rules + health endpoint | Uptime Kuma polls `/api/live`. Rules in [03-data-structures.md](./03-data-structures.md) |
| Monorepo | bun workspaces + Cargo | TS packages managed by bun, Rust probe by Cargo |
| Deployment | CF Worker + D1 | Single deployment target, no separate hosting for UI |

---

## Monorepo Structure

```
bat/
├── probe/                          # Rust crate (Cargo)
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
│   │       ├── api.ts              # Route constants, hashHostId, request/response types
│   │       └── constants.ts        # Thresholds, intervals, retention days
│   ├── worker/                     # @bat/worker — CF Worker (Hono)
│   │   ├── package.json
│   │   ├── wrangler.toml
│   │   ├── static/                 # UI build output (gitignored, built by @bat/ui)
│   │   ├── migrations/             # D1 migrations (sequential, numbered)
│   │   └── src/
│   │       ├── index.ts            # Hono app + cron scheduled handler
│   │       ├── types.ts            # Env bindings (DB, API keys, Access config)
│   │       ├── routes/             # API route handlers
│   │       ├── services/           # Business logic (metrics, alerts, aggregation)
│   │       └── middleware/
│   │           ├── api-key.ts      # Read/write key validation (route-scoped)
│   │           ├── access-auth.ts  # Cloudflare Access JWT verification
│   │           └── entry-control.ts # Dual-entry routing (Access vs API key)
│   └── ui/                         # @bat/ui — Vite + React SPA
│       ├── package.json
│       ├── vite.config.ts
│       ├── playwright.config.ts    # L3 Playwright E2E config
│       ├── tests/                  # Playwright test specs
│       └── src/
│           ├── App.tsx             # React Router routes
│           ├── routes/             # Page components
│           ├── components/         # UI components (shadcn/ui, charts, layout)
│           └── lib/                # API hooks (SWR), utilities
├── scripts/                        # Build, test, release scripts
├── .husky/                         # Git hooks (pre-commit, pre-push)
├── package.json                    # Root: bun workspaces, turbo scripts
├── turbo.json                      # Build pipeline
└── biome.json                      # Formatter + linter
```

---

## Auth Model

### Three auth scopes

| Scope | Mechanism | Who uses it | Routes |
|-------|-----------|-------------|--------|
| **Write** | `BAT_WRITE_KEY` (Bearer token) | Probe | `POST /api/ingest`, `POST /api/identity`, `POST /api/tier2` |
| **Machine read** | `BAT_READ_KEY` (Bearer token) | Uptime Kuma | `GET /api/monitoring/*` |
| **Browser** | Cloudflare Access JWT | Dashboard users | `GET /api/hosts`, `/api/alerts`, `/api/tags`, etc. |
| **Public** | None | Anyone | `GET /api/live`, `GET /api/me` |

Worker middleware (`entry-control.ts`) routes requests based on hostname:
- Requests from `bat.hexly.ai` → Access JWT verification
- Requests from `bat-ingest.worker.hexly.ai` → API key whitelist matching

Browser never needs to know any API key. Cloudflare Access handles authentication externally; the Worker only verifies the JWT signature.

---

## Deployment

### CF Worker + D1

```bash
# Apply D1 migrations (MUST run before deploy if new columns are referenced)
cd packages/worker && npx wrangler d1 migrations apply bat-db --remote --env production

# Deploy Worker (includes UI static assets)
cd packages/worker && npx wrangler deploy --env production
```

Worker secrets: `BAT_WRITE_KEY`, `BAT_READ_KEY`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`

### Probe on VPS

Installation via `probe/install.sh`. Binaries hosted on R2 (`https://s.zhe.to/apps/bat/latest/`). See CLAUDE.md § Probe Build & Release for cross-compile and deployment details.

---

## Verification Checklist

### End-to-end flow

1. Probe running on VPS → sends metrics every 30s
2. Worker receives, stores in D1, evaluates alerts
3. `curl /api/live` → returns version + host status (200 for healthy, 503 for critical)
4. Uptime Kuma monitors `/api/monitoring/health` → alerts on critical
5. Browser visits `bat.hexly.ai` → Cloudflare Access login → SPA loads → live host grid

### Resource budget

| Metric | Target | How to verify |
|--------|--------|---------------|
| Probe RSS | < 15 MB | `cat /proc/$(pidof bat-probe)/status \| grep VmRSS` |
| Probe binary | < 4 MB | `ls -lh bat-probe` (musl static) |
| Probe CPU | < 0.1% idle | `top -p $(pidof bat-probe)` |
| Network per probe | ~3 KB/min | `tcpdump` sample |
| Worker latency | < 50ms ingest | Wrangler logs |
| D1 rows/day | ~17,280 (6 hosts × 2/min × 1440 min) | `SELECT COUNT(*) FROM metrics_raw` |
