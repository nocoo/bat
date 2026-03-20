# bat docs

## Index

| # | Document | Description |
|---|----------|-------------|
| 01 | [metrics-catalogue](./01-metrics-catalogue.md) | **Signal reference** — all collected metrics (T1/T2/T3/Identity), procfs sources, alert rules, resource budget |
| 02 | [architecture](./02-architecture.md) | System architecture, key decisions, MVP scope, monorepo structure, deployment |
| 03 | [data-structures](./03-data-structures.md) | D1 schema, migration strategy, payload types, alert rules |
| 04 | [probe](./04-probe.md) | Rust probe: collectors, main loop, config, systemd |
| 05 | [worker](./05-worker.md) | CF Worker: routes, ingest, alerts, health endpoint, aggregation cron |
| 06 | [dashboard](./06-dashboard.md) | Next.js dashboard: Google OAuth, proxy architecture, charts |
| 07 | [testing](./07-testing.md) | Four-layer testing strategy, Husky hooks |
| 08 | [commits](./08-commits.md) | Atomic commits plan (Phase 0–5, 46 commits) |
| 09 | [tier3-signals](./09-tier3-signals.md) | Tier 3 design rationale: PSI, disk I/O, TCP state, OOM kills, FD usage |
| 10 | [host-inventory](./10-host-inventory.md) | Host inventory design: CPU topology, virtualization, network, block devices |
| 11 | [host-tags](./11-host-tags.md) | Host tagging: tags table, CRUD API, dashboard UI, filtering |
| 12 | [software-discovery](./12-software-discovery.md) | Tier 2 software detection: process/systemd/binary/package scanning, ~40 common tools |
| 13 | [host-events](./13-host-events.md) | Host events: webhook tokens, event ingest, rate limiting, dashboard UI |
| 14 | [top-processes](./14-top-processes.md) | Per-process CPU/Memory/IO monitoring: procfs collection, Top 50 snapshot, Dashboard table with sort/filter/color |
| 15 | [enhanced-software-and-websites](./15-enhanced-software-and-websites.md) | Expand software registry (frp/Xray/n8n/etc.), Docker image→software mapping, Nginx/Apache vhost website discovery |
| 16 | [monitoring-api](./16-monitoring-api.md) | Monitoring API for Uptime Kuma integration: host health tiers, group aggregation, alert endpoints, auto-onboarding flow |
