# bat docs

## Index

- [01-metrics-catalogue.md](./01-metrics-catalogue.md) — Metrics catalogue: Tier 1 (MVP) + Tier 2 (post-MVP), procfs sources, alert rules, resource budget
- [02-architecture.md](./02-architecture.md) — System architecture, key decisions, MVP scope, monorepo structure, deployment
- [03-data-structures.md](./03-data-structures.md) — D1 schema, migration strategy, payload types, alert rules
- [04-probe.md](./04-probe.md) — Rust probe: collectors, main loop, config, systemd
- [05-worker.md](./05-worker.md) — CF Worker: routes, ingest, alerts, health endpoint, aggregation cron
- [06-dashboard.md](./06-dashboard.md) — Next.js dashboard: Google OAuth, proxy architecture, charts
- [07-testing.md](./07-testing.md) — Four-layer testing strategy, Husky hooks
- [08-commits.md](./08-commits.md) — Atomic commits plan (Phase 0–5, 46 commits)
- [09-tier3-signals.md](./09-tier3-signals.md) — Tier 3 signals: PSI pressure, disk I/O, TCP state, OOM kills (procfs-native, zero-cost)
