# Changelog

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
