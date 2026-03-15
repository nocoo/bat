# bat

Lightweight VPS monitoring system — replacing Netdata with a purpose-built probe.

## Docs

- [docs/01-metrics-catalogue.md](./docs/01-metrics-catalogue.md) — Metrics catalogue: Tier 1 (MVP) + Tier 2 (post-MVP), procfs sources, alert rules, resource budget
- [docs/02-architecture.md](./docs/02-architecture.md) — System architecture, key decisions, MVP scope, monorepo structure, deployment
- [docs/03-data-structures.md](./docs/03-data-structures.md) — D1 schema, migration strategy, payload types, alert rules
- [docs/04-probe.md](./docs/04-probe.md) — Rust probe: collectors, main loop, config, systemd
- [docs/05-worker.md](./docs/05-worker.md) — CF Worker: routes, ingest, alerts, health endpoint, aggregation cron
- [docs/06-dashboard.md](./docs/06-dashboard.md) — Next.js dashboard: Google OAuth, proxy architecture, charts
- [docs/07-testing.md](./docs/07-testing.md) — Four-layer testing strategy, Husky hooks
- [docs/08-commits.md](./docs/08-commits.md) — Atomic commits plan (Phase 0–5, 46 commits)
