# Changelog

## v0.3.0 (2026-03-17)

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
- Change dashboard port from 7020 to 7041
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
- Change dashboard port from 7020 to 7041
- Update Dockerfile for probe binary serving

## v0.2.0 (2026-03-15)

Initial release with full monitoring stack:
- Rust probe with CPU, memory, disk, network collectors
- Cloudflare Worker with D1 storage, alert evaluation, hourly aggregation
- Next.js 16 dashboard with host overview, detail charts, alert table
- Google OAuth authentication with email allowlist
