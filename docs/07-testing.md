# 07 — Testing & Quality System

> Six-dimension quality system: **three test layers (L1/L2/L3) + two gates (G1/G2) + one isolation (D1)**.
> Each module document ([04-probe.md](./04-probe.md), [05-worker.md](./05-worker.md), [06-ui.md](./06-ui.md)) contains its own module-specific test plan. This document defines the shared strategy, dimension definitions, Husky hooks, CI integration, and cross-module verification.
>
> Related documents:
> - [02-architecture.md](./02-architecture.md) — System overview, verification checklist
> - [03-data-structures.md](./03-data-structures.md) — Shared types testing (L1)
> - [04-probe.md](./04-probe.md) — Probe testing (L1)
> - [05-worker.md](./05-worker.md) — Worker testing (L1, L2)
> - [06-ui.md](./06-ui.md) — UI SPA (L3 Playwright E2E)
> - [08-commits.md](./08-commits.md) — Atomic commits plan
> - [18-quality-system-upgrade.md](./18-quality-system-upgrade.md) — Tier C → S upgrade plan

---

## Dimension Definitions

| Dimension | What | Tools | Trigger | Target |
|-----------|------|-------|---------|--------|
| **L1** Unit | Pure logic tests, coverage enforcement | Bun test (TS), `cargo llvm-cov` (Rust) | pre-commit | ≥ 90% TS, ≥ 95% Rust |
| **L2** Integration | Real HTTP E2E, full API routes | Bun test + local Wrangler | pre-push | 100% route coverage |
| **L3** System/E2E | Browser-level user flows | Playwright (Chromium) | manual/CI | Core user journeys |
| **G1** Static | Zero errors, zero warnings | Biome strict (TS), `cargo clippy -D warnings` + `cargo fmt` (Rust) | pre-commit | 0 diagnostics |
| **G2** Security | Dependency CVEs + secrets detection | osv-scanner, gitleaks | pre-push | 0 vulnerabilities, 0 leaks |
| **D1** Isolation | Test resources physically separated | `[env.test]` → `bat-db-test`, `verify-test-bindings.ts` | build-time | All test bindings use `-test` suffix |

### Tier System

| Tier | Requirement |
|------|-------------|
| **S** | All six dimensions green |
| **A** | L1 + L2 + G1 + D1 + one more |
| **B** | L1 + G1 |
| **C** | Any basic dimension failing |

---

## L1 — Unit Tests

Pure logic tests. No network, no database, no UI rendering (except component snapshot tests). Fast, deterministic, run on every commit.

### Per-module coverage

| Module | Tool | Coverage target | Key test areas |
|--------|------|----------------|----------------|
| `@bat/shared` | Bun test | ≥ 90% | Alert rule definitions, threshold constants |
| `@bat/worker` | Bun test | ≥ 90% | Alert evaluation (6 rules), aggregation SQL, metrics resolution, API key middleware, route handlers |
| `probe/` | `cargo llvm-cov` | ≥ 95% | Procfs parsing, delta calc, rate math, config parsing, payload serialization, retry logic |

Note: `@bat/ui` is a thin SPA shell served from Worker static assets. No unit tests — build verification only.

### Testing conventions

- **TS**: Test files colocated as `*.test.ts` / `*.test.tsx` alongside source
- **Rust**: `#[cfg(test)]` modules inline, or `tests/` directory for integration-style tests
- **Fixtures**: Embedded strings (not real `/proc` reads) for determinism
- **Mocks**: Minimal — prefer testing pure functions. Mock HTTP only for sender/retry tests

---

## G1 — Static Analysis

Zero tolerance for errors and warnings. Catches type errors, formatting issues, and code smells before they enter the codebase.

| Module | Tool | Config |
|--------|------|--------|
| All TS packages | Biome | `biome.json` at repo root, `all: true` strict mode |
| All TS packages | TypeScript | `tsc --noEmit` (typecheck only) |
| `probe/` | `cargo clippy` | `-- -D warnings` (deny all warnings) |
| `probe/` | `cargo fmt` | `--check` (format verification) |

Lint runs via `lint-staged` on staged files only (incremental, not full-repo scan).

---

## L2 — Integration E2E

End-to-end tests against a real local Wrangler dev server with a real local D1 database. Tests the full request→response cycle including middleware, routing, D1 queries, and response formatting.

**Scope**: All Worker routes. Full test matrix in [05-worker.md § L2](./05-worker.md).

**Server convention**:
- Worker dev: port 8787
- API E2E tests: port 18787

**Setup**: `test:e2e` script self-bootstraps: starts a Wrangler dev server on port 18787, applies migrations to local D1, seeds test data, runs the test suite, and tears down the server on exit. No external server required.

**Run**: `bun turbo test:e2e --filter=@bat/worker`

---

## L3 — System/E2E

Browser-level tests using Playwright (Chromium). Verifies core UI flows against a local Wrangler dev server with real D1.

**Auth strategy**: Cloudflare Access is external, so localhost bypasses auth. Tests run in "anonymous" mode (`/api/me` returns `authenticated: false`).

**Port convention**: 27787 (separate from L2's 18787 and dev's 8787/7025).

**Server**: Playwright's `webServer` config starts Wrangler on port 27787 with its own persist dir (`.wrangler/e2e-pw`) to avoid conflicts with L2.

**Test specs** (`packages/ui/tests/`):

| Spec | What |
|------|------|
| `hosts.spec.ts` | Hosts list, sidebar nav, routing, empty state |
| `host-detail.spec.ts` | Breadcrumbs, time range picker, navigation |
| `tags.spec.ts` | Create input, button state, empty state |
| `alerts.spec.ts` | Alerts page, table headers, empty state |
| `events.spec.ts` | Events page, table structure, empty state |
| `webhooks.spec.ts` | Webhooks settings, host dropdown, empty state |
| `setup.spec.ts` | Install guide, code blocks, copy buttons, collapsible uninstall |

**Run**: `cd packages/ui && bunx playwright test` (or from root: `bun run test:e2e:pw`)

**CI only**: L3 is too slow for local hooks. Runs as a parallel CI job (`l3-playwright`) with Chromium, report uploaded as artifact.

---

## G2 — Security Gate

Dependency vulnerability scanning and secrets leak detection. Runs on every push.

| Tool | What | Scope |
|------|------|-------|
| osv-scanner | Known CVEs in dependencies | `bun.lock` (JS) + `probe/Cargo.lock` (Rust) |
| gitleaks | Secrets/credentials in git history | Commits since upstream (or last 20 if no upstream) |

**Config**: `.gitleaks.toml` (allowlist for known false positives)

**Run**: `bun run scripts/run-security.ts`

---

## D1 — Test Isolation

Test resources are physically separated from dev/prod.

| Resource | Dev/Prod | Test |
|----------|----------|------|
| D1 Database | `bat-db` (89d4d080) | `bat-db-test` (04bd8235) |
| Worker name | `bat` | `bat-test` |
| Environment var | `development` / `production` | `test` |

**Verification**: `bun run scripts/verify-test-bindings.ts` checks all `[env.test]` bindings use `-test` suffixed names.

**Marker table**: `_test_marker` (migration `0018`) — inserted only into test DB for identification.

---

## Husky Hooks

### pre-commit (L1 + G1)

Runs on every commit. Must pass for commit to succeed.

```bash
# G1: TypeScript typecheck
bun turbo typecheck

# G1: Biome lint (staged files only via lint-staged)
bunx lint-staged

# L1: Unit tests with coverage (TS ≥90%, Rust ≥95%)
bash scripts/check-coverage.sh 90 95

# G1: Rust lint (only if probe/ changed)
cargo fmt --check && cargo clippy -- -D warnings
```

### pre-push (L2 + G2)

Runs before push. L2 and G2 execute in parallel.

```bash
# L2: Worker API E2E (self-bootstraps Wrangler dev server)
bun turbo test:e2e --filter=@bat/worker &

# G2: Security gate (osv-scanner + gitleaks)
bun run scripts/run-security.ts &

# Wait for both; fail if either fails
```

### Coverage enforcement

`scripts/check-coverage.sh` parses Bun test coverage output and fails if any package drops below threshold.

---

## GitHub Actions CI

CI mirrors the local hooks but runs in parallel for faster feedback.

```yaml
# .github/workflows/ci.yml
jobs:
  quality:        # L1 + G1 + G2 via nocoo/base-ci (secrets: inherit)
  l2-e2e:         # L2: Worker E2E (parallel, local Wrangler/D1)
  l3-playwright:  # L3: Playwright browser E2E (parallel, Chromium)
  probe:          # Rust: cargo test + clippy + fmt (parallel)
```

**Key design decisions**:

1. **Parallel execution**: `l2-e2e` and `probe` run in parallel with `quality` (no `needs` dependency) for faster CI (~50% time reduction).

2. **`secrets: inherit`**: Required for G2 security scanning (gitleaks, osv-scanner) to access repo secrets.

3. **Local D1**: L2 E2E uses Wrangler's local miniflare D1 emulation — no cloud secrets needed, fully deterministic.

4. **Rust caching**: `Swatinem/rust-cache` caches cargo artifacts, reducing probe build time from ~2min to ~20s on cache hit.

5. **workflow_dispatch**: Allows manual CI trigger from GitHub UI for debugging.

---

## Cross-Module Integration Verification

Beyond per-module testing, these scenarios verify the full system works end-to-end:

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

These are manual verification steps (not automated in hooks) — performed before each deployment.
