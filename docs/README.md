# bat docs

## Index

- [01-probe-metrics-spec.md](./01-probe-metrics-spec.md) — VPS probe metrics specification: what to collect, how to collect, intervals
- [02-architecture.md](./02-architecture.md) — System architecture, key decisions, MVP scope, monorepo structure, deployment
- [03-data-structures.md](./03-data-structures.md) — D1 schema, migration strategy, payload types, alert rules
- [04-probe.md](./04-probe.md) — Rust probe: collectors, main loop, config, systemd
- [05-worker.md](./05-worker.md) — CF Worker: routes, ingest, alerts, health endpoint, aggregation cron
- [06-dashboard.md](./06-dashboard.md) — Next.js dashboard: Google OAuth, proxy architecture, charts
- [07-testing.md](./07-testing.md) — Four-layer testing strategy, Husky hooks
- [08-commits.md](./08-commits.md) — Atomic commits plan (Phase 0–5, 46 commits)
