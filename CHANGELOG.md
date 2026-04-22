# Changelog

## v1.1.0

### Changed
- Sync ui + probe versions to 1.0.4 (catch-up before v1.1.0)
- Log run 50 — parsePortParam wire-semantics fix
- Switch local dev to full-stack; lift worker coverage to 96%
- MVVM simplification — reduce complexity_score 18.7% (49 experiments)

### Fixed
- Cover ui package.json + probe Cargo.{toml,lock}
- Root bun dev now launches ui + worker in parallel
- Restore pre-refactor wire semantics for DELETE :port

## v1.0.4

### Added
- Expand Playwright tests from 36 to 69 with seeded data
- Add D1 seed data for Playwright tests
- Add D1 isolation check to pre-push gate
- Expand L3 Playwright tests from 9 to 36
- Add L3 Playwright E2E tests and update hooks
- Add /api/me to public routes for local dev
- Add user info display in sidebar footer
- Proxy to production API for local dev with HMR
- Add Vite proxy for HMR development
- Migrate charts to host detail page
- Add /api/setup route with secure key handling
- Migrate dashboard components to standalone SPA package
- Add static assets config for SPA hosting
- Add dual-endpoint auth with Access JWT support
- Upgrade /api/live to surety standard (#10)
- Add automated release script

### Changed
- Add edge deployment design and rewrite testing doc
- Rewrite architecture for edge SPA, clean Next.js references
- Update L3 section to reflect Playwright implementation
- Update rustls-webpki to fix vulnerability
- Adapt E2E tests for SPA and localhost bypass
- Optimize CI with parallel jobs and Rust probe tests
- Update local dev workflow to use production API
- Update root dev script to use @bat/ui instead of @bat/dashboard
- Update sync-version.sh and mark Phase 5 progress
- Update turbo config and docs for edge dashboard migration
- Boost tier2-read coverage to 100%
- Boost api-key middleware coverage to 100%
- Boost maintenance route coverage to 100%
- Boost tier2-alerts service coverage to 99%
- Boost status service coverage to 100%
- Boost hosts route coverage to 100%
- Boost ingest route coverage to 100%
- Update README to replace pnpm with bun
- Update CLAUDE.md for bun migration and CI setup
- Add GitHub Actions workflow with base-ci reusable workflow
- Add test:unit:coverage scripts for CI compatibility
- Migrate package manager from pnpm to bun
- 6DQ L1+G1 compliance (#3)

### Fixed
- Use non-colliding probe version in seed data
- Remove stale dashboard/package.json reference
- Replace border-input/bg-input with basalt tokens
- Add test:unit:coverage script for base-ci compatibility
- Address Clippy lint warnings for CI compatibility
- Correct Rust action and exclude static from lint
- Correct Rust action name to dtolnay/rust-toolchain
- Add logo files and fix favicon path
- Skip API key auth for localhost/dev.hexly.ai
- Explicitly set Host header in Vite proxy
- Treat *.dev.hexly.ai as localhost for local dev
- Allow bat.dev.hexly.ai host in Vite dev server
- Use correct dev port 7025 for Caddy integration
- Use vite build --watch for dev mode
- Fail closed when Access not configured
- Strengthen hosts allowlist assertion to check derived status
- Keep tier2-alerts private helpers unexported
- Upgrade hono to 4.12.14
- Resolve biome lint warnings in scripts/release.ts
- Biome auto-fix release.ts
- Migrate remaining inputs from border-input to border-border
- Button outline + inline input remove border-input
- Use check-coverage.sh as CI coverage gate with threshold enforcement
- Resolve CVEs in next and rand, clean up osv-scanner ignores

### Removed
- Remove Next.js dashboard, migrate to edge UI

## v1.0.3 (2026-04-11)

### Performance

- **D1 rows_read optimization** — Replace window function query in `/api/hosts` with batched per-host LIMIT 1 queries, reducing rows_read from 322,900 to 4 (for 4 hosts)
- **Revert ineffective batch optimization** — Removed `db.batch()` refactor that didn't reduce D1 billing (D1 bills by rows read/written, not roundtrips)

### Security

- Update hono 4.7.0 → 4.12.12 to fix security vulnerabilities
- Update Next.js 16.2.2 → 16.2.3 (GHSA-q4gf-8mx6-v5v3)

## v1.0.1 (2026-04-04)

### Dashboard

- **Events pagination** — Add offset-based pagination to Events page with 30 items per page, Previous/Next controls, and total count display

### API

- **Events list pagination** — `GET /api/events` now returns `EventsListResponse` with `items`, `total`, `limit`, `offset` fields

## v1.0.0 (2026-04-04)

🎉 **First stable release!**

### Dashboard

- **TimeRangePicker redesign** — Align with Basalt B-4 PeriodSelector spec: segmented control with `bg-secondary` container and `bg-card shadow-sm` selected state

### Chores

- Update Next.js 16.2.1 → 16.2.2
- Add osv-scanner ignore config for upstream vulnerabilities (Next.js GHSA-5f7q-jpqc-wp7h, undici via workerd)
- Remove blog.nocoo.cloud from VPS fleet (server decommissioned)

## v0.10.8 (2026-04-03)

### Performance

- **Dockerfile optimization** — Switch from pnpm to bun for dependency installation, reducing Railway build time from ~53s to ~33s (-37%)

### Fixes

- **Railway build reliability** — Root cause analysis: builds failed when BuildKit parallelism dropped due to resource constraints. Optimized Dockerfile now completes faster, reducing timeout failures
- **API key sync issue** — Fixed 403 errors caused by Railway env var desync after failed deployments

### Chores

- Add `workspaces` field to package.json for bun compatibility
- Add bun.lock to version control (required for Docker builds)
- Migrate dashboard port 7041 → 7025

## v0.10.7 (2026-03-30)

### Dashboard

- **Login page redesign** — Card aspect ratio, header strip with barcode decoration, GitHub link, footer
- **Sidebar collapsible** — Replace native button with Radix Collapsible, refine group header and nav item padding
- **Version badge** — Replace Badge component with lightweight raw span (text-[10px] pill)
- **Content page polish** — tabular-nums on all numeric cells (processes table, info rows, disk bars), fade-up entry animation with stagger on host card grid
- **Docker build** — Add .dockerignore excluding logo.png and *.md

### Refactoring

- Rename worker `bat-worker` → `bat` per D1 isolation spec
- Remove 15 stale `#[allow(dead_code)]` and 2 dead functions in probe
- Remove dead ESLint comments (project uses Biome)
- Narrow blanket biome-ignore to specific `lint/style/noNonNullAssertion`
- Add 5 TS strict extras to shared/worker tsconfig

### Tests

- Add comprehensive Playwright E2E specs for dashboard (L3)
- Split Playwright specs into 4 focused files
- Wire test Worker read key into Playwright E2E config

### Chores

- Sync version to 0.10.6 across all packages (was inconsistent between root and dashboard)
- Remove retired docker.nocoo.cloud from VPS fleet docs

## v0.10.2 (2026-03-23)

### Features

- **Six-dimension quality system** (docs/18) — Upgrade from four-layer testing to six-dimension quality system (L1/L2/L3 + G1/G2 + D1), Tier C → S roadmap with 12 atomic commits
- **G2 security gate** — Add osv-scanner (dependency CVE scanning for pnpm-lock.yaml + Cargo.lock) and gitleaks (secrets leak detection) as pre-push gate, running in parallel with L2 E2E tests
- **D1 test isolation** — Wire `bat-db-test` as `[env.test]` D1 binding in wrangler.toml, add `verify-test-bindings.ts` isolation guard and `_test_marker` migration
- **Unicode tag names** — Allow unicode characters in tag names, enforce length-only constraint

### Refactoring

- **Biome strict mode** — Upgrade from `recommended: true` to `all: true` with explicit opt-outs, achieving zero errors and zero warnings across 47+ files
- **lint-staged** — Replace full-repo `biome check .` with incremental staged-file-only lint via lint-staged
- **Coverage gate hardened** — Fix `check-coverage.sh`: fail on missing data (was silently passing), check line coverage instead of function coverage, add dashboard lib-only mode (UI thin shells exempt)

### Fixes

- **11 dependency CVEs** — Upgrade next 16.1.6 → 16.2.1, add pnpm override for undici ≥7.24.0
- **Dashboard coverage** — Add 82 lib/hooks tests (975 lines) achieving 100% lib coverage for dashboard

### Tests

- Comprehensive dashboard lib + hooks coverage tests (82 tests, 219 assertions) covering all 18 target files
- Rust coverage maintained at 99.1% (≥95% threshold)

## v0.10.1 (2026-03-21)

### Features

- **Maintenance windows** (docs/17) — Dashboard UI for per-host maintenance windows with time picker, chart overlays (yellow shading), and alert suppression during maintenance periods
- **Worker maintenance routes** — `GET/PUT/DELETE /api/hosts/:id/maintenance` with maintenance-aware alert evaluation and query-time filtering

### Refactoring

- **Dashboard D1 direct → Worker proxy** — All tag and port allowlist operations now go through Worker routes instead of direct D1 REST API access. Dashboard routes reduced to thin auth+proxy wrappers
  - 13 new Worker route handlers: 9 tag routes (`routes/tags.ts`) + 4 port allowlist routes (`routes/allowed-ports.ts`)
  - 8 Dashboard route files converted from `d1Query()` to `proxyToWorker()`/`proxyToWorkerWithBody()`
  - Deleted `lib/d1.ts` (Cloudflare D1 REST API client), `d1.test.ts`, `tags/route.test.ts`
  - Removed Dashboard dependency on `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, `CF_API_TOKEN` env vars

### Fixes

- **Tag rename uniqueness** — `PUT /api/tags/:id` now returns 409 on UNIQUE constraint conflict instead of 500
- **Port allowlist host validation** — `GET/POST /api/hosts/:id/allowed-ports` now verify host exists (404) instead of returning empty arrays or FK-dependent errors
- **Alerts cache invalidation** — Maintenance mutations now properly invalidate cached alert state

### Tests

- 69 Worker E2E tests (was 39): tags CRUD, port allowlist CRUD, auth 403 checks, rename-duplicate 409, unknown-host 404
- Probe Rust coverage raised to 95% threshold with 16 new `orchestrate.rs` tests

## v0.10.0 (2026-03-21)

### Features

- **Monitoring API** (docs/16) — 4 new read-only Worker endpoints under `/api/monitoring/*` for Uptime Kuma integration:
  - `GET /api/monitoring/hosts` — fleet overview with health tiers, alert summaries, tier/tag filters
  - `GET /api/monitoring/hosts/:id` — single host keyword endpoint (`"tier":"healthy"`) for Uptime Kuma monitors
  - `GET /api/monitoring/groups` — tag-based group aggregation with worst-tier derivation and `(untagged)` fallback
  - `GET /api/monitoring/alerts` — active alerts enriched with hostname, tags, duration, severity/tag filters
- **Fleet status split** — Extract `GET /api/fleet/status` from `/api/live`, separating liveness probe from fleet health

### Architecture

- **Worker reads tags (read-only)** — Worker now has read-only SELECT access to `tags` and `host_tags` for monitoring aggregation. Tag CRUD remains Dashboard-only
- **Separate-query-then-assemble** — Monitoring endpoints use parallel D1 queries assembled in-memory, avoiding cartesian JOIN blowup on alerts × tags
- **`deriveHostStatus()` reuse** — All tier derivation goes through the shared function including `port_allowlist` suppression

### Tests

- 36 new monitoring route tests with 100% line and function coverage
- Added `0010_tags.sql` migration to mock-d1 test helper

## v0.9.0 (2026-03-20)

### Features

- **Website discovery** (docs/15) — When Nginx or Apache is detected, parse vhost configs to extract served domains. New WebsitesPanel on host detail page with SSL indicators and web server badges
- **Enhanced software registry** — 9 new software entries: frps, frpc, Xray, V2Ray, Clash, Uptime Kuma, Umami, n8n, Portainer. New `proxy` category for tunneling software
- **Docker image → software mapping** — 6th detection layer cross-references running container images against a known-image registry (Uptime Kuma, n8n, Portainer, Watchtower, Umami), with version extraction from image tags
- **Port detection restored** — Add `AmbientCapabilities=CAP_DAC_READ_SEARCH` to systemd unit, restoring socket→PID→process mapping for the `bat` user

### Fixes

- **Docker image dedup** — `match_by_docker_images()` now deduplicates within its own results, preventing duplicate software entries when multiple containers share the same image
- **Apache inline comments** — Apache vhost parser now strips inline comments (e.g. `ServerName example.com # primary`), matching Nginx parser behavior

### Database

- Migration `0016_websites.sql` — Add `websites_json` column to tier2_snapshots table

### Tests

- Websites JSON round-trip assertions for worker ingest and read paths
- 33 new probe tests: Nginx/Apache vhost parsing, domain validation, dedup, Docker image matching
- Rust coverage: 87.29% (≥85% threshold)

## v0.8.0 (2026-03-20)

### Features

- **Top processes** (docs/14) — Two-phase procfs collection capturing top 50 CPU/memory consumers per sample. New TopProcessesTable on host detail page with sortable columns
- **Tier 2 interval reduction** — Tier 2 collection interval reduced from 6 hours to 30 minutes for faster software/security discovery
- **Remove updates collector** — Drop package update monitoring and related alert rules (too noisy, low signal)

### Fixes

- **Top processes tracking** — Track `prev_states` for ALL PIDs (not just top N), fixing invisible CPU-spiking processes that only appear after crossing the threshold
- **Hourly empty state** — Distinguish hourly-no-data from missing process data in dashboard, showing contextual empty state instead of misleading message
- **Stale status data** — Add `cache: no-store` to proxy fetch preventing CDN-cached stale host status
- **Webhook cascade** — Prevent webhook deletion from cascading to events; fix rate-limit and idempotency bugs

### Dashboard

- Upgrade host card badges to basalt soft/tinted style with hash-based coloring

### Database

- Migration `0015_top_processes.sql` — Add `top_processes_json` column to metrics_raw table

## v0.7.0 (2026-03-19)

### Features

- **Host Events** (docs/13) — Webhook-based event ingestion for servers to report deployments, backups, cron jobs, and other event logs. D1 storage, dashboard Events page with expandable JSON body, Webhook Settings page for token management
  - `POST /api/events` — webhook token + IP-validated event ingest with rate limiting (10/min default)
  - `GET /api/events` — event listing with host filter and pagination
  - Webhook CRUD (`/api/webhooks`) — create, list, delete, regenerate tokens
  - 30-day automatic event retention via scheduled worker
- **Per-host port allowlist** — Suppress `public_port` alerts for expected open ports, with info badge annotation in alert table
- **Tag management panel** — Inline tag editing on host detail page
- **Sparkline chart upgrade** — Replace bar charts with 3-line CPU/MEM/NET area chart on host cards

### Fixes

- **Strict IP validation** — Remove `X-Forwarded-For` fallback in event ingest, only trust `CF-Connecting-IP`
- **Write key enforcement** — Require `BAT_WRITE_KEY` for webhook CRUD mutations (was incorrectly using read key)
- **Webhook settings error handling** — Add try/catch to regenerate/delete actions with error banner UI
- **React key warning** — Use keyed `<Fragment>` in EventTable
- Revalidate hosts and alerts SWR cache after allowlist change
- Exclude fully-allowed `public_port` alerts from host warning status
- Enforce min 11px font and full-width sparklines in host card
- Prevent flash-to-skeleton on SWR background revalidation

### Database

- Migration `0012_port_allowlist.sql` — Add port_allowlist column to hosts table
- Migration `0013_host_events.sql` — Create webhook_configs and events tables with indexes

### Tests

- E2E coverage for webhook CRUD, event ingest auth chain, payload validation, rate limiting, and event listing

## v0.6.0 (2026-03-18)

### Features

- **Host tags** (docs/11) — D1 direct tags CRUD, management page, filter bar on hosts page
- **Software discovery** (docs/12) — Probe 5-signal collector (~40 items), shared types, worker ingest/read, dashboard UI card

### Fixes

- Tags PUT validate-before-delete
- Tier2 read path inventory fields JOIN
- E2E test migration list updated

## v0.5.2 (2026-03-17)

### Features

- **Probe version tracking** — Store `probe_version` from identity payload in D1, display in dashboard host detail System Info card as "Probe Version: v0.5.2"

### Database

- Migration `0007_probe_version.sql` — Add `probe_version` column to hosts table

### Tests

- 4 new unit tests: probe_version storage, update, null backward compat, detail response

## v0.5.1 (2026-03-17)

### Fixes

- **Virtualization detection** — Add DMI `product_name` fallback for KVM detection; Red Hat vendor + KVM product was misidentified as bare-metal
- **Public IP race condition** — Await initial echo service fetch (15s timeout) before sending first identity, ensuring `public_ip` is included from startup

## v0.5.0 (2026-03-17)

### Features

- **Host inventory** — Comprehensive identity collection: CPU topology (logical/physical), memory/swap totals, virtualization detection (KVM/VMware/AWS/Hetzner/bare-metal), network interfaces (MAC, IPv6, link speed), block devices (size, rotational), boot mode (UEFI/BIOS), timezone, DNS resolvers/search domains
- **Public IP** — Probe fetches public IP from `echo.nocoo.cloud/api/ip` every 1 hour, enabling "find host by IP" use case
- **Host detail endpoint** — New `GET /api/hosts/:id` returning full inventory (JSON arrays for interfaces/disks/DNS), separate from lightweight overview polling
- **Host card subtitle** — Show "Ubuntu 22.04 · x86_64 · 4C/8T · 8 GB" below hostname in list view
- **System Info card** — Enhanced detail page with CPU topology, memory, swap, virtualization, boot mode, public IP, IP addresses, DNS, timezone, disks
- **2-state wire semantics** — Key present = update value, key absent = retain old value; backward compatible with older probes

### Database

- Migration `0005_host_inventory.sql` — 11 new columns on hosts table (cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization, net_interfaces, disks, boot_mode, timezone, dns_resolvers, dns_search)
- Migration `0006_public_ip.sql` — Add public_ip column to hosts table

### Tests

- 4 new E2E tests: identity inventory merge, host detail endpoint, tier2 DNS merge, 404 handling
- Unit tests for all new formatters (shortenOs, formatMemory, formatCpuTopology, buildSubtitle)
- Identity merge tests: public_ip present/retained, inventory partial update
- Host detail tests: full inventory, null fields, public_ip, metrics + alert status

## v0.4.0 (2026-03-17)

### Features

- **Tier 3 signals** — PSI pressure (CPU/memory/IO), disk I/O (per-device IOPS/throughput/utilization), TCP state (established/time_wait/orphan), OOM kill counter, CPU extensions (ctxt switches, forks, procs running/blocked), file descriptor usage
- **T3 alert rules** — 6 new rules: PSI CPU/memory/IO thresholds, disk I/O utilization, OOM kill, TCP time_wait
- **T3 dashboard charts** — PSI pressure, disk I/O, TCP connection state charts
- **Actionable alerts** — Alert table with severity labels, messages, and relative timestamps

### Dashboard

- 6:4 two-column layout for detail page (time-series left, overview right)
- Improved host card density, typography, and hover states
- Date-aware time format for chart axes on 7d+ ranges
- Sidebar nav group structure with GitHub icon
- Collapsible animations for advanced sections

### Fixes

- Metrics auto-refresh stuck on stale time window
- Prevent chart full redraw on auto-refresh
- Proper `disk_io_json` hourly aggregation
- T3 hourly aggregation pipeline
- Tier 2/3 migration application in E2E test setup

### Features

- **Tier 2 monitoring** — Probe collects deep system data every 6 hours: listening ports, package updates, systemd failed services, SSH/firewall security posture, Docker container status, and disk deep scan (large files, du per-directory)
- **Tier 2 worker routes** — `POST /api/tier2` ingest, T2 alert evaluation (rules #7-15), D1 storage for all T2 data categories
- **Tier 2 alert rules** — Evaluate security posture (SSH password auth, root login, firewall), failed systemd services, stale package updates, Docker unhealthy containers, and disk space hogs
- **Host ID hashing** — Hash host_id in dashboard URLs to prevent domain/hostname exposure

### Fixes

- **Decouple T2 from T1 tick loop** — Tier 2 collection now runs as independent `tokio::spawn` task, preventing slow T2 collectors (du, find, docker) from blocking 30s T1 metrics
- **Offload ports scan to blocking thread pool** — `read_listening_ports()` synchronous procfs scan wrapped in `spawn_blocking` to avoid stalling the single-threaded executor
- **Fix SSH Include semantics** — Only inject sshd_config.d files at Include directive locations; stop unconditionally appending config fragments when no Include exists
- **Preserve stdout in CommandError** — `ExitStatus` variant now carries both stdout and stderr, fixing systemd collector losing unit listing when systemctl exits non-zero
- **Fix systemd parser** — Use `split_whitespace` to handle multi-space column alignment, filter to `.service` units only
- **Add iptables fallback** — Firewall detection now checks iptables when ufw is not available
- **Preserve alert_states during migration** — Migration 0003 no longer drops and recreates alert_states table

### Tests

- Add Rust coverage check to pre-commit pipeline (`cargo-llvm-cov --fail-under-lines`)
- Add tier 2 payload serialization and `skip_serializing_if` tests
- Add edge case tests for T2 parsing (docker stats, du, find, systemd)
- Add ports.rs coverage: IPv6 decode, inode map, listening ports
- Add tier 2 conversion function tests in orchestrate.rs
- Boost payload.rs coverage with extreme values, unicode, sparse fields
- Add `coverage(off)` annotations to main.rs glue functions

### Chores

- Align dashboard card style with pew design (borderless bg-secondary)
- Align dashboard charts with pew design style
- Improve responsive layout, eliminate mobile sidebar flash
- Change dashboard port from 7020 to 7041, then to 7025
- Add dev script convenience commands

## v0.2.1 (2026-03-16)

### Features

- **Setup page** — Auth-protected page with pre-filled probe install command
- **Probe install script** — One-click `curl | bash` installer with systemd service
- **Probe binary distribution** — Download API routes and R2-backed binary hosting
- **Dashboard /api/live** — Public liveness endpoint returning version and component name
- **Worker /api/live** — Replace /api/health with unified health + version endpoint
- **Version tracking** — Add `probe_version` to probe payloads, shared version constant

### Fixes

- Fix standalone server cwd path for probe-assets in Docker
- Fix Cargo cache invalidation in cross-compile Dockerfile (`touch` before rebuild)
- Fix Turbopack root config for monorepo Docker builds
- Fix AUTH_SECRET build-time placeholder in Dockerfile
- Fix probe config file ownership and value escaping
- Download probe binary from R2 instead of Dashboard API

### Chores

- Add CLAUDE.md with version management and release checklist
- Add probe cross-compile Dockerfile (`probe/Dockerfile.build`)
- Change dashboard port from 7020 to 7041, then to 7025
- Update Dockerfile for probe binary serving

## v0.2.0 (2026-03-15)

Initial release with full monitoring stack:
- Rust probe with CPU, memory, disk, network collectors
- Cloudflare Worker with D1 storage, alert evaluation, hourly aggregation
- Next.js 16 dashboard with host overview, detail charts, alert table
- Google OAuth authentication with email allowlist
