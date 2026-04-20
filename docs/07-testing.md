# 07 — Testing & Quality System

> Six-dimension quality system: **three test layers (L1/L2/L3) + two gates (G1/G2) + one isolation (D1)**.
> Each dimension has defined scope, tools, trigger timing, pass criteria, and failure behavior.
>
> Related documents:
> - [02-architecture.md](./02-architecture.md) — System overview, verification checklist
> - [03-data-structures.md](./03-data-structures.md) — Shared types testing (L1)
> - [04-probe.md](./04-probe.md) — Probe testing (L1)
> - [05-worker.md](./05-worker.md) — Worker testing (L1, L2)
> - [06-ui.md](./06-ui.md) — UI SPA (L3 Playwright E2E)
> - [19-edge-deployment.md](./19-edge-deployment.md) — Edge deployment design

---

## Dimension Overview

| Dimension | What | Tools | Trigger | Pass criteria |
|-----------|------|-------|---------|---------------|
| **L1** Unit | Pure logic tests | Bun test (TS), `cargo llvm-cov` (Rust) | pre-commit | ≥ 90% TS, ≥ 95% Rust |
| **L2** Integration | Real HTTP E2E against Wrangler | Bun test + local Wrangler/D1 | pre-push | 100% route coverage, 57 tests |
| **L3** Browser E2E | User flows in real browser | Playwright (Chromium) | CI only | All specs pass, 69 tests |
| **G1** Static | Type errors, lint, format | Biome, tsc, clippy, cargo fmt | pre-commit | 0 diagnostics |
| **G2** Security | CVEs + secrets | osv-scanner, gitleaks | pre-push | 0 vulnerabilities, 0 leaks |
| **D1** Isolation | Test/prod resource separation | `[env.test]` bindings, verify script | build-time | All test bindings use `-test` suffix |

### Tier System

| Tier | Requirement | Current status |
|------|-------------|----------------|
| **S** | All six dimensions green | **Yes** |
| **A** | L1 + L2 + G1 + D1 + one more | — |
| **B** | L1 + G1 | — |
| **C** | Any basic dimension failing | — |

---

## L1 — Unit Tests

**What**: Pure logic tests. No network, no database, no browser. Fast, deterministic.

**When**: Every commit (pre-commit hook).

**Tools**: `bun test` (TypeScript), `cargo test` / `cargo llvm-cov` (Rust).

### Coverage targets

| Module | Tool | Target | Key test areas |
|--------|------|--------|----------------|
| `@bat/shared` | Bun test | ≥ 90% | Alert rule definitions, threshold constants, type guards |
| `@bat/worker` | Bun test | ≥ 90% | Alert evaluation (6 rules), aggregation SQL, metrics resolution, middleware, route handlers |
| `probe/` | `cargo llvm-cov` | ≥ 95% | Procfs parsing, delta calc, rate math, config parsing, payload serialization, retry logic |

`@bat/ui` has no unit tests — it is a thin SPA shell. Build verification only.

### Conventions

- **TS**: Test files colocated as `*.test.ts` alongside source
- **Rust**: `#[cfg(test)]` modules inline, or `tests/` for integration-style
- **Fixtures**: Embedded strings (not real `/proc` reads) for determinism
- **Mocks**: Minimal — prefer testing pure functions. Mock HTTP only for sender/retry tests

### Run

```bash
# TS coverage
bash scripts/check-coverage.sh 90 95

# Rust coverage
cd probe && cargo llvm-cov --text
```

### Failure behavior

Pre-commit hook blocks the commit. Developer must fix before retrying.

---

## L2 — Integration E2E

**What**: End-to-end HTTP tests against a real local Wrangler dev server with real local D1. Tests the full request → middleware → D1 query → response cycle.

**When**: Every push (pre-push hook).

**Scope**: All Worker API routes — 57 tests covering ingest, identity, alerts, hosts, tags, webhooks, events, monitoring, port allowlist.

### Port convention

| Purpose | Port |
|---------|------|
| Worker dev | 8787 |
| L2 E2E tests | 18787 |
| L3 Playwright | 27787 |
| UI Vite dev | 7025 |

### How it works

1. `test:e2e` script starts Wrangler on port 18787 with `--persist-to .wrangler/e2e`
2. Applies all D1 migrations to the local database
3. Runs Bun test suite against `http://localhost:18787`
4. Tests execute sequentially (some tests depend on prior state, e.g. create → read → delete)
5. Wrangler process is killed on exit

### Auth during L2

Entry control detects `localhost` → all auth bypassed. Tests call routes directly without API keys or Access JWTs.

### Run

```bash
bun turbo test:e2e --filter=@bat/worker
```

### Migration sync requirement

The E2E test file (`packages/worker/test/e2e/wrangler.test.ts`) has a **hardcoded migration list**. When adding a new migration file, it must also be added to this list — otherwise E2E tests get 500 on routes that touch new tables.

### Failure behavior

Pre-push hook blocks the push. All 57 tests must pass.

---

## L3 — Browser E2E

**What**: Browser-level Playwright tests verifying user-visible behavior. Real Chromium browser interacts with a real Wrangler server serving the built SPA.

**When**: CI only (too slow for local hooks, ~30s+ with browser startup).

**Scope**: 69 tests across 7 spec files covering all UI pages.

### Architecture

```
Playwright (Chromium)
      │
      ▼
  localhost:27787 (Wrangler dev)
      │
      ├── /* → static assets (built SPA)
      └── /api/* → Worker handlers → local D1
```

### Auth strategy

Cloudflare Access is external and not available in local testing. Localhost bypasses entry control entirely. The SPA works in "anonymous" mode — `/api/me` returns `authenticated: false`, and no login flow is needed.

### Test data seeding

Tests require realistic data in D1. The seed pipeline:

1. `scripts/l3-setup.sh` runs before Wrangler starts (via Playwright's `webServer.command`)
2. Applies all D1 migrations to `.wrangler/e2e-pw` persist dir
3. Runs `scripts/l3-seed.sql` — inserts:
   - 2 hosts (`pw-host-alpha`, `pw-host-beta`) with full inventory
   - Raw metrics (3 rows with CPU/mem/disk/net data)
   - 3 tags (production, staging, us-east) with host assignments
   - 2 alert states (warning + critical) for alpha
   - 1 webhook config for alpha
   - 2 events (deploy, config reload)

Host IDs are FNV-1a hashes: `pw-host-alpha` → `f0d3fd30`, `pw-host-beta` → `4c494cde`.

### Test specs

| Spec | Tests | What |
|------|-------|------|
| `hosts.spec.ts` | 14 | Host cards render, hostname display, status badges, tag filter bar, tag filtering, card navigation, version badge |
| `host-detail.spec.ts` | 14 | Header hostname, status badge, system info (OS, CPU, kernel, probe version, IP), breadcrumb navigation, unknown host fallback |
| `alerts.spec.ts` | 8 | Alert table, headers, host names, severity levels, alert messages, host link navigation, row count |
| `events.spec.ts` | 8 | Event table, headers, titles, host name, event tags, host link navigation, row count |
| `tags.spec.ts` | 9 | Seeded tags display, host count badges, create tag, delete tag, inline rename |
| `webhooks.spec.ts` | 11 | Existing webhook display, curl command, copy/regenerate/delete buttons, host dropdown filtering, generate for new host |
| `setup.spec.ts` | 5 | Install guide, code blocks, copy buttons, collapsible uninstall section |

### Self-contained tests

Tests that modify state (create/delete/rename) are self-contained — they create their own data and clean up after themselves. This avoids cross-test dependencies.

### Playwright config

```typescript
// packages/ui/playwright.config.ts
{
  testDir: './tests',
  webServer: {
    command: 'bash ../../scripts/l3-setup.sh && cd ../worker && bunx wrangler dev --port 27787 --local --persist-to .wrangler/e2e-pw',
    url: 'http://localhost:27787',
    reuseExistingServer: false,
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://localhost:27787',
  },
}
```

### Run

```bash
# Run all L3 tests
cd packages/ui && bunx playwright test

# Run with UI (interactive debugging)
cd packages/ui && bunx playwright test --ui

# From root
bun run test:e2e:pw
```

### Failure behavior

CI job fails; PR cannot merge. Test report uploaded as CI artifact for debugging.

---

## G1 — Static Analysis

**What**: Zero tolerance for type errors, lint warnings, and format violations.

**When**: Every commit (pre-commit hook).

### Tools

| Module | Tool | Config |
|--------|------|--------|
| All TS packages | Biome | `biome.json` at repo root, `all: true` strict mode |
| All TS packages | TypeScript | `tsc --noEmit` (typecheck only) |
| `probe/` | `cargo clippy` | `-- -D warnings` (deny all warnings) |
| `probe/` | `cargo fmt` | `--check` (format verification) |

Biome lint runs via `lint-staged` on staged files only (incremental).

### Failure behavior

Pre-commit hook blocks the commit. Zero diagnostics required.

---

## G2 — Security Gate

**What**: Dependency CVE scanning and secrets leak detection.

**When**: Every push (pre-push hook) + CI.

### Tools

| Tool | What | Scope |
|------|------|-------|
| osv-scanner | Known CVEs in dependencies | `bun.lock` (JS) + `probe/Cargo.lock` (Rust) |
| gitleaks | Secrets/credentials in staged commits | `.gitleaks.toml` (allowlist for false positives) |

### Run

```bash
# JS dependencies
osv-scanner scan --lockfile=bun.lock

# Rust dependencies
osv-scanner scan --lockfile=probe/Cargo.lock

# Secrets detection
gitleaks protect --staged --no-banner
```

### Failure behavior

Pre-push hook blocks the push. Zero vulnerabilities, zero leaks required.

---

## D1 — Test Isolation

**What**: Test resources are physically separated from dev/prod to prevent accidental data corruption.

**When**: Verified at build time and in pre-push hook.

### Resource separation

| Resource | Dev/Prod | Test |
|----------|----------|------|
| D1 Database | `bat-db` (89d4d080) | `bat-db-test` (04bd8235) |
| Worker name | `bat` | `bat-test` |
| Environment var | `development` / `production` | `test` |

### Verification

- `scripts/verify-test-bindings.ts` — checks all `[env.test]` bindings use `-test` suffixed names
- `_test_marker` table (migration `0018`) — only exists in test DB for positive identification
- Pre-push hook runs D1 isolation check before L2 tests

### Failure behavior

Pre-push hook blocks the push if test bindings reference production resources.

---

## Hook Execution Model

### pre-commit: L1 + G1 (5 parallel stages)

Runs on every `git commit`. All stages execute in parallel; any failure blocks the commit.

| Stage | Command | What |
|-------|---------|------|
| `unit_cov` | `bash scripts/check-coverage.sh 90 95` | L1: TS + Rust unit tests with coverage |
| `typecheck` | `bun turbo typecheck` | G1: TypeScript type checking |
| `lint` | `bunx lint-staged` | G1: Biome lint on staged files |
| `rust_lint` | `cargo fmt --check && cargo clippy -- -D warnings` | G1: Rust format + lint (only if `probe/` changed) |
| `gitleaks` | `gitleaks protect --staged --no-banner` | G2: Secrets detection on staged changes |

**Total time**: ~15-20s (parallel, dominated by unit tests + Rust compilation).

### pre-push: L2 + G2 + D1 (3 parallel stages)

Runs before `git push`. All stages execute in parallel; any failure blocks the push.

| Stage | Command | What |
|-------|---------|------|
| `d1_isolation` | `scripts/verify-test-bindings.ts` | D1: Verify test bindings |
| `l2_e2e` | `bun turbo test:e2e --filter=@bat/worker` | L2: Full API E2E (57 tests) |
| `osv_js` + `osv_rust` | `osv-scanner scan --lockfile=...` | G2: CVE scanning for JS + Rust deps |

**Total time**: ~25-30s (parallel, dominated by Wrangler startup + test execution).

### What's NOT in hooks

| Dimension | Why not in hooks |
|-----------|-----------------|
| L3 (Playwright) | ~30s+ with browser startup, requires built UI assets — runs in CI only |

---

## CI Pipeline

GitHub Actions runs all dimensions in parallel for maximum speed.

```yaml
# .github/workflows/ci.yml
jobs:
  quality:         # L1 + G1 + G2 via nocoo/base-ci
  l2-e2e:          # L2: Worker E2E (local Wrangler/D1)
  l3-playwright:   # L3: Browser E2E (Chromium)
  probe:           # Rust: cargo test + clippy + fmt
```

### Job details

| Job | Runs | Duration | Dependencies |
|-----|------|----------|-------------|
| `quality` | L1 unit tests, G1 typecheck + lint, G2 osv-scanner + gitleaks | ~45s | None |
| `l2-e2e` | 57 Worker API E2E tests against local Wrangler | ~30s | None |
| `l3-playwright` | 69 Playwright browser tests with Chromium | ~60s | None (builds UI internally) |
| `probe` | `cargo test` + `cargo clippy` + `cargo fmt --check` | ~60s (cold) / ~20s (cached) | None |

All four jobs run in parallel (no `needs` dependency). Total CI time: ~60s (wall clock).

### CI-specific details

- **`secrets: inherit`**: Required for G2 security scanning
- **Local D1**: L2 and L3 both use Wrangler's local miniflare D1 emulation — no cloud secrets needed
- **Rust caching**: `Swatinem/rust-cache` reduces probe build from ~2min to ~20s
- **L3 report**: Playwright HTML report uploaded as artifact on failure
- **`workflow_dispatch`**: Manual CI trigger available from GitHub UI

---

## Cross-Module Integration Verification

Manual verification before each deployment (not automated in hooks):

| # | Scenario | How to verify |
|---|----------|---------------|
| 1 | Probe → Worker ingest | Run Probe against local Wrangler, check `metrics_raw` in D1 |
| 2 | Probe → Worker identity | Restart Probe, check `hosts` table updated |
| 3 | Alert evaluation | Send metrics exceeding thresholds, check `alert_states` populated |
| 4 | Live endpoint | After alerts fire, `curl /api/live` returns correct status + HTTP code |
| 5 | UI → Worker API | Login to UI, verify host list loads from Worker via SWR |
| 6 | Time range switching | Select 7d range in UI, verify hourly resolution data returned |
| 7 | Retired host rejection | Retire a host via D1 console, verify Probe gets 403 |
| 8 | Aggregation cron | Trigger `__scheduled`, verify `metrics_hourly` populated, old `metrics_raw` purged |

---

## Quick Reference

### Run everything locally

```bash
# L1 + G1 (same as pre-commit)
bash scripts/check-coverage.sh 90 95
bun turbo typecheck
bunx lint-staged

# L2 (same as pre-push)
bun turbo test:e2e --filter=@bat/worker

# L3 (CI only, but runnable locally)
cd packages/ui && bunx playwright test

# G2
osv-scanner scan --lockfile=bun.lock
osv-scanner scan --lockfile=probe/Cargo.lock

# D1 isolation check
bun run scripts/verify-test-bindings.ts
```

### Test counts

| Layer | Tests | Specs/Files |
|-------|-------|-------------|
| L1 TS | Coverage-based (≥90%) | Colocated `*.test.ts` |
| L1 Rust | Coverage-based (≥95%) | Inline `#[cfg(test)]` |
| L2 | 57 | 1 file (`wrangler.test.ts`) |
| L3 | 69 | 7 specs |
| **Total** | **126+** | — |
