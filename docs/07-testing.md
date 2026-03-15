# 07 — Testing Strategy

> Four-layer testing methodology applied across all bat modules.
> Each module document ([04-probe.md](./04-probe.md), [05-worker.md](./05-worker.md), [06-dashboard.md](./06-dashboard.md)) contains its own module-specific test plan. This document defines the shared strategy, layer definitions, Husky hooks, and cross-module verification.
>
> Related documents:
> - [02-architecture.md](./02-architecture.md) — System overview, verification checklist
> - [03-data-structures.md](./03-data-structures.md) — Shared types testing (L1)
> - [04-probe.md](./04-probe.md) — Probe testing (L1, L2, L3)
> - [05-worker.md](./05-worker.md) — Worker testing (L1, L2, L3)
> - [06-dashboard.md](./06-dashboard.md) — Dashboard testing (L1, L2, L3, L4)
> - [08-commits.md](./08-commits.md) — Atomic commits plan

---

## Layer Definitions

| Layer | What | Tools | Trigger | Target |
|-------|------|-------|---------|--------|
| L1 — UT | Unit tests for pure logic | Bun test (TS), `cargo test` (Rust) | pre-commit | 90%+ coverage |
| L2 — Lint | Code quality, zero warnings | Biome (TS), `cargo clippy` (Rust) | pre-commit | 0 errors, 0 warnings |
| L3 — API E2E | 100% of Worker API routes | Bun test + local Wrangler | pre-push | All routes covered |
| L4 — BDD E2E | Core user flows in Dashboard | Playwright (Chromium) | On-demand | Login → overview → detail → alerts |

---

## L1 — Unit Tests

Pure logic tests. No network, no database, no UI rendering (except component snapshot tests). Fast, deterministic, run on every commit.

### Per-module coverage

| Module | Tool | Coverage target | Key test areas |
|--------|------|----------------|----------------|
| `@bat/shared` | Bun test | ≥ 90% | Alert rule definitions, threshold constants |
| `@bat/worker` | Bun test | ≥ 90% | Alert evaluation (6 rules), aggregation SQL, metrics resolution, API key middleware, route handlers |
| `@bat/dashboard` | Bun test | ≥ 90% | Data transforms, proxy logic, component rendering, proxy route integration (session mock + HTTP mock) |
| `probe/` | `cargo test` | ≥ 90% | Procfs parsing, delta calc, rate math, config parsing, payload serialization, retry logic |

### Testing conventions

- **TS**: Test files colocated as `*.test.ts` / `*.test.tsx` alongside source
- **Rust**: `#[cfg(test)]` modules inline, or `tests/` directory for integration-style tests
- **Fixtures**: Embedded strings (not real `/proc` reads) for determinism
- **Mocks**: Minimal — prefer testing pure functions. Mock HTTP only for sender/retry tests

---

## L2 — Lint

Zero tolerance for warnings. Catches type errors, formatting issues, and code smells before they enter the codebase.

| Module | Tool | Config |
|--------|------|--------|
| All TS packages | Biome | `biome.json` at repo root, strict mode |
| All TS packages | TypeScript | `tsc --noEmit` (typecheck only) |
| `probe/` | `cargo clippy` | `-- -D warnings` (deny all warnings) |
| `probe/` | `cargo fmt` | `--check` (format verification) |

---

## L3 — API E2E

End-to-end tests against a real local Wrangler dev server with a real local D1 database. Tests the full request→response cycle including middleware, routing, D1 queries, and response formatting.

**Scope**: All Worker routes. Full test matrix in [05-worker.md § L3](./05-worker.md).

**Server convention**:
- Worker dev: port 8787
- API E2E tests: port 18787

**Setup**: `test:e2e` script self-bootstraps: starts a Wrangler dev server on port 18787, applies migrations to local D1, seeds test data, runs the test suite, and tears down the server on exit. No external server required.

**Run**: `pnpm --filter @bat/worker test:e2e`

---

## L4 — BDD E2E

Browser-level tests using Playwright. Validates the critical user journeys through the Dashboard.

**Scope**: 4 core flows. Full test matrix in [06-dashboard.md § L4](./06-dashboard.md).

**Server convention**:
- Dashboard dev server: port 28787
- Auth bypass: `E2E_SKIP_AUTH=1` environment variable (same pattern as Surety)

**Run**: `pnpm --filter @bat/dashboard test:e2e` (on-demand, not in hooks)

---

## Husky Hooks

### pre-commit

Runs on every commit. Must pass for commit to succeed.

```bash
# TypeScript
pnpm turbo typecheck
pnpm biome check .
pnpm --filter @bat/shared test -- --coverage  # ≥ 90%
pnpm --filter @bat/worker test -- --coverage  # ≥ 90%
pnpm --filter @bat/dashboard test -- --coverage  # ≥ 90%

# Rust
cd probe && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

### pre-push

Runs before push. Includes L3 API E2E (self-bootstraps its own Wrangler dev server).

```bash
pnpm --filter @bat/worker test:e2e  # API E2E against local Wrangler
```

### Coverage enforcement

A `scripts/check-coverage.sh` script parses Bun test coverage output and fails if any package drops below 90%. Called by pre-commit hook.

---

## Cross-Module Integration Verification

Beyond per-module testing, these scenarios verify the full system works end-to-end:

| # | Scenario | How to verify |
|---|----------|---------------|
| 1 | Probe → Worker ingest | Run Probe against local Wrangler, check `metrics_raw` in D1 |
| 2 | Probe → Worker identity | Restart Probe, check `hosts` table updated |
| 3 | Alert evaluation | Send metrics exceeding thresholds, check `alert_states` populated |
| 4 | Health endpoint | After alerts fire, `curl /api/health` returns correct status + HTTP code |
| 5 | Dashboard proxy | Login to Dashboard, verify host list loads from Worker via proxy |
| 6 | Time range switching | Select 7d range in Dashboard, verify hourly resolution data returned |
| 7 | Retired host rejection | Retire a host via D1 console, verify Probe gets 403 |
| 8 | Aggregation cron | Trigger `__scheduled`, verify `metrics_hourly` populated, old `metrics_raw` purged |

These are manual verification steps (not automated in hooks) — performed before each deployment.

---

## Atomic Commits (this module)

| # | Commit | Files | Verify |
|---|--------|-------|--------|
| 0.6 | `chore: setup husky pre-commit and pre-push hooks` | `.husky/`, `scripts/check-coverage.sh` | `git commit` runs hooks |
