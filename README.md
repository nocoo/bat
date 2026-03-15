# bat

Lightweight VPS monitoring system — a purpose-built replacement for Netdata (120-243MB RSS) across 6 VPS hosts.

## Architecture

```
VPS hosts              Cloudflare              Railway
┌──────────┐          ┌──────────────┐         ┌──────────────┐
│ bat-probe │──POST──>│  bat-worker  │<──GET───│  dashboard   │
│  (Rust)   │         │ (Hono + D1)  │         │ (Next.js 16) │
└──────────┘          └──────────────┘         └──────────────┘
  ~2MB RSS             CF Workers + D1          Bun standalone
  30s interval         Hourly aggregation       Google OAuth
  systemd unit         Alert evaluation         Recharts
```

## Components

| Component | Stack | Location |
|-----------|-------|----------|
| **Probe** | Rust, tokio, reqwest | `probe/` |
| **Worker** | Hono, Cloudflare Workers, D1 | `packages/worker/` |
| **Dashboard** | Next.js 16, React 19, SWR, Recharts | `packages/dashboard/` |
| **Shared Types** | TypeScript | `packages/shared/` |

## Metrics Collected

- **CPU**: usage%, iowait%, steal%, load averages (1/5/15)
- **Memory**: total, available, used%, swap usage
- **Disk**: per-mount total, available, used%
- **Network**: per-interface rx/tx bytes rate, errors
- **System**: uptime, hostname, OS, kernel, architecture

## Alert Rules (Tier 1)

| Rule | Type | Threshold | Severity |
|------|------|-----------|----------|
| `mem_high` | Instant | > 85% | Warning |
| `no_swap` | Instant | 0 swap + > 70% mem | Critical |
| `disk_full` | Instant | > 90% | Critical |
| `iowait_high` | Duration (5m) | > 30% | Warning |
| `steal_high` | Duration (5m) | > 10% | Warning |
| `host_offline` | Query-time | > 120s since last seen | Critical |

## Development

```bash
# Install dependencies
pnpm install

# Run all typechecks
pnpm turbo typecheck

# Run all tests
pnpm turbo test

# Dev servers
pnpm --filter @bat/worker dev      # Worker on port 8787
pnpm --filter @bat/dashboard dev   # Dashboard on port 7020

# Probe
cd probe && cargo build --release
```

## Deployment

### Worker (Cloudflare)

```bash
cd packages/worker

# Set secrets
wrangler secret put BAT_WRITE_KEY --env production
wrangler secret put BAT_READ_KEY --env production

# Run migration
wrangler d1 execute bat-db-prod --env production --file=migrations/0001_initial.sql

# Deploy
wrangler deploy --env production
```

### Dashboard (Railway / Docker)

```bash
# Build from monorepo root
docker build -f packages/dashboard/Dockerfile .
```

Required environment variables: `BAT_API_URL`, `BAT_READ_KEY`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS`.

### Probe (systemd)

```bash
cd probe && cargo build --release
# Copy binary and config to target host
# Install systemd unit from probe/dist/bat-probe.service
```

## Test Summary

| Module | Tests | Coverage |
|--------|-------|----------|
| @bat/shared | 26 | 100% |
| @bat/worker | 85 | 90%+ |
| @bat/dashboard | 47 | 90%+ |
| probe (Rust) | 67 | — |
| **Total** | **225** | |

## Docs

- [docs/01-metrics-catalogue.md](./docs/01-metrics-catalogue.md) — Metrics catalogue: Tier 1 (MVP) + Tier 2 (post-MVP), procfs sources, alert rules, resource budget
- [docs/02-architecture.md](./docs/02-architecture.md) — System architecture, key decisions, MVP scope, monorepo structure, deployment
- [docs/03-data-structures.md](./docs/03-data-structures.md) — D1 schema, migration strategy, payload types, alert rules
- [docs/04-probe.md](./docs/04-probe.md) — Rust probe: collectors, main loop, config, systemd
- [docs/05-worker.md](./docs/05-worker.md) — CF Worker: routes, ingest, alerts, health endpoint, aggregation cron
- [docs/06-dashboard.md](./docs/06-dashboard.md) — Next.js dashboard: Google OAuth, proxy architecture, charts
- [docs/07-testing.md](./docs/07-testing.md) — Four-layer testing strategy, Husky hooks
- [docs/08-commits.md](./docs/08-commits.md) — Atomic commits plan (Phase 0-5, 46 commits)
