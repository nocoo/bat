# 08 — Atomic Commits Plan

> Complete commit-by-commit implementation plan across all modules.
> Each commit is self-contained, buildable, and testable. No commit leaves the codebase in a broken state.
>
> Related documents:
> - [02-architecture.md](./02-architecture.md) — System overview, monorepo structure
> - [03-data-structures.md](./03-data-structures.md) — Shared types (Phase 1)
> - [04-probe.md](./04-probe.md) — Probe implementation (Phase 3)
> - [05-worker.md](./05-worker.md) — Worker implementation (Phase 2)
> - [06-ui.md](./06-ui.md) — UI SPA (Phase 4)
> - [07-testing.md](./07-testing.md) — Testing strategy, Husky hooks

---

## Phase 0 — Scaffolding

Set up monorepo structure, tooling, and empty packages. No business logic.

| # | Commit | Files | Verify |
|---|--------|-------|--------|
| 0.1 | `chore: init monorepo with pnpm workspaces` | `pnpm-workspace.yaml`, root `package.json`, `turbo.json`, `biome.json`, `.gitignore` | `pnpm install` succeeds |
| 0.2 | `chore: scaffold shared types package` | `packages/shared/**` | `pnpm turbo build --filter=@bat/shared` |
| 0.3 | `chore: scaffold worker package` | `packages/worker/package.json`, `wrangler.toml`, `src/index.ts` (hello world) | `pnpm --filter @bat/worker dev` returns 200 |
| 0.4 | `chore: scaffold probe crate` | `probe/Cargo.toml`, `probe/src/main.rs` (hello world) | `cargo build --release` |
| 0.5 | `chore: scaffold dashboard from surety template` | `packages/dashboard/**` (copy + clean) | `pnpm --filter @bat/dashboard dev` starts |
| 0.6 | `chore: setup husky pre-commit and pre-push hooks` | `.husky/`, `scripts/check-coverage.sh` | `git commit` runs hooks |

---

## Phase 1 — Shared Types

Define all TypeScript types, constants, and alert rules in `@bat/shared`. These are the single source of truth consumed by Worker and Dashboard.

Full specification: [03-data-structures.md](./03-data-structures.md)

| # | Commit | Files | Verify |
|---|--------|-------|--------|
| 1.1 | `feat: add metrics payload types` | `packages/shared/src/metrics.ts` | Typecheck passes |
| 1.2 | `feat: add identity payload types` | `packages/shared/src/identity.ts` | Typecheck passes |
| 1.3 | `feat: add alert types and 6 tier-1 rules` | `packages/shared/src/alerts.ts`, `constants.ts` | Typecheck passes |
| 1.4 | `feat: add api route types, response dtos, and constants` | `packages/shared/src/api.ts`, `index.ts` | Build + typecheck |
| 1.5 | `test: add unit tests for shared types` | `packages/shared/src/__tests__/alerts.test.ts` | `bun test` passes |

---

## Phase 2 — Worker + D1

Implement CF Worker routes, D1 schema, alert evaluation, and aggregation cron.

Full specification: [05-worker.md](./05-worker.md)

| # | Commit | Files | Verify |
|---|--------|-------|--------|
| 2.1 | `feat: add d1 schema and migration infrastructure` | `packages/worker/migrations/0001_initial.sql` | `wrangler d1 execute --local --file=migrations/0001_initial.sql` |
| 2.2 | `feat: add api key auth middleware with read/write scopes` | `middleware/api-key.ts` | UT: write key on POST routes, read key on GET routes, reject cross-scope usage |
| 2.3 | `feat: add identity route` | `routes/identity.ts`, `services/metrics.ts` | UT + manual curl |
| 2.4 | `feat: add ingest route` | `routes/ingest.ts` | UT + manual curl → 204 |
| 2.5 | `feat: add alert evaluation service` | `services/alerts.ts` | UT: all 6 rules, instant + duration |
| 2.6 | `feat: wire alert evaluation into ingest` | `routes/ingest.ts` | UT: ingest triggers alert state changes |
| 2.7 | `feat: add hosts list route with overview dto` | `routes/hosts.ts`, `services/status.ts` | UT: returns `HostOverviewItem[]` with status, metrics, alert counts |
| 2.8 | `feat: add metrics query route with auto resolution` | `routes/hosts.ts` | UT: raw vs hourly selection |
| 2.9 | `feat: add health endpoint with warning/critical distinction` | `routes/health.ts` | UT: 200 (healthy/warning-only), 503 (critical), offline detection |
| 2.10 | `feat: add alerts list route` | `routes/alerts.ts` | UT: returns all active alerts across hosts |
| 2.11 | `feat: add hourly aggregation cron` | `services/aggregation.ts`, `index.ts` scheduled handler | UT: aggregate + purge logic |
| 2.12 | `test: add api e2e tests for all worker routes` | `packages/worker/test/e2e/**` | All routes pass against local Wrangler |

---

## Phase 3 — Rust Probe

Implement Probe collectors, HTTP sender, main loop, and systemd unit.

Full specification: [04-probe.md](./04-probe.md)

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

---

## Phase 4 — Dashboard

Implement Dashboard pages, proxy routes, charts, and E2E tests.

Full specification: [06-dashboard.md](./06-dashboard.md)

| # | Commit | Files | Verify |
|---|--------|-------|--------|
| 4.1 | `feat: add api proxy routes to worker` | `app/api/hosts/route.ts`, `app/api/alerts/route.ts`, etc. | L1 UT: proxy route handlers (session mock, header forwarding, error passthrough) |
| 4.2 | `feat: add api client and swr hooks` | `lib/api.ts`, `lib/hooks/*` | UT: fetch wrapper, mock responses |
| 4.3 | `feat: add host card and status badge components` | `components/host-card.tsx`, `status-badge.tsx` | UT: render with mock data |
| 4.4 | `feat: add hosts overview page` | `app/hosts/page.tsx` | Dev server: grid renders |
| 4.5 | `feat: add chart components` | `components/charts/*` | UT: data transformation |
| 4.6 | `feat: add host detail page with charts` | `app/hosts/[id]/page.tsx` | Dev server: charts render |
| 4.7 | `feat: add alerts page` | `app/alerts/page.tsx`, `components/alert-table.tsx` | Dev server: alerts render |
| 4.8 | `feat: configure sidebar navigation` | `components/layout/sidebar.tsx` | Nav items correct |
| 4.9 | `test: add bdd e2e tests for core flows` | `e2e/**` | Playwright: login → overview → detail → alerts |

---

## Phase 5 — Deployment

Production deployment configuration.

| # | Commit | Files | Verify |
|---|--------|-------|--------|
| 5.1 | `chore: configure worker production deployment` | `wrangler.toml` (production D1 ID, secrets) | `wrangler deploy` succeeds |
| 5.2 | `chore: configure dashboard dockerfile` | `Dockerfile` | `docker build` succeeds, Railway deployment works |
| 5.3 | `docs: update readme with project overview` | `README.md` | Links to docs work |

---

## Commit Summary

| Phase | Commits | Focus |
|-------|---------|-------|
| 0 — Scaffolding | 6 | Monorepo, tooling, empty packages |
| 1 — Shared Types | 5 | TypeScript types, constants, alert rules |
| 2 — Worker + D1 | 12 | All Worker routes, D1 schema, alert evaluation, aggregation |
| 3 — Rust Probe | 11 | Collectors, sender, main loop, systemd |
| 4 — Dashboard | 9 | Pages, proxy, charts, E2E tests |
| 5 — Deployment | 3 | Production config |
| **Total** | **46** | |

### Dependency order

```
Phase 0 (scaffolding)
  └→ Phase 1 (shared types — consumed by Phase 2, 3, 4)
       ├→ Phase 2 (worker — must exist before Phase 3 integration test)
       │    └→ Phase 3 (probe — tests against local worker)
       └→ Phase 4 (dashboard — proxies to worker)
            └→ Phase 5 (deployment — all modules ready)
```

Phase 2 and Phase 3 can be developed in parallel after Phase 1, but Phase 3.11 (integration test) requires Phase 2 to be complete. Phase 4 requires Phase 2 (Worker routes must exist for proxy). Phase 5 requires all prior phases.
