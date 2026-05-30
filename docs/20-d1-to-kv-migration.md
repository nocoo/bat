# 20 — Storage Layer Repository Abstraction (D1-only, behavior-preserving)

> Status: Draft v4 · Owner: @MBP-SDE-A · Reviewer: @MBP-Reviewer-A · For: @zheng-li
> Replaces v1–v3 (which proposed a KV migration). KV is **out of scope** for this task. v1–v3 design remains in git history (`00ec0a8`, `3b74fda`, `975ff57`) for future reference if engine switch is reconsidered.

## 0. Scope

- **Goal**: Refactor the worker's storage access into a `routes → repos → adapters/d1` layering. **D1 stays as the only storage engine.**
- **Constraints (per @zheng-li)**:
  1. **Architecture must simplify** — fewer concepts, not more.
  2. **Test coverage must be very high** — at least the existing 95% line/branch gate, ideally higher on the repo and adapter layers.
  3. **Behaviour must not change** — every API contract, response shape, status code, alert evaluation result, cron output, and DB write is identical before and after.

What this is **not**:

- No KV layout, no KV adapter, no Miniflare KV setup.
- No metric compression / delta-suppression / forward-fill (those were KV-economic measures).
- No schema changes, no migrations.
- No retention policy changes — D1 keeps its current 7d raw / 90d hourly behaviour as is.

## 1. Why this is worth doing on its own

Even without KV, the codebase pays a real tax today:

- 78 direct `c.env.DB` references in 25 route files. Every new route copies SQL plumbing alongside business logic.
- `services/*.ts` is a flat dumping ground (~15 files) where some files own DB writes (`metrics.ts`, `agents.ts`), some own pure compute (`aggregation.ts` mixed with both), and the boundary is fuzzy.
- Route tests today either spin up a real D1 and assert on rows, or mock individual SQL strings. There is no sharp seam to mock or to swap.
- Adding an integration test for a new route (the kind we just had to add for `PATCH /api/hosts/:id/description`) requires understanding the full D1 schema, not just the relevant repo's contract.

A repo layer fixes all four with one concept: **a typed contract per domain, with one concrete adapter today (D1), implemented behind it.** Routes consume the contract; tests target the contract; future engine swaps (if ever) target the contract.

## 2. Target shape

```
routes/*  ──►  repos/*  ──►  adapters/d1/*  ──►  c.env.DB
   (HTTP,        (typed         (SQL — the
   validation,   contracts +    statements
   response      types in       lifted from
   shape)        @bat/shared    today's
                 or worker)     services/)
```

- **`packages/worker/src/repos/`** — one file per domain. Each file exports an interface and a public type set. Routes import only from here. No SQL strings.
- **`packages/worker/src/adapters/d1/`** — one file per repo, implementing the contract by talking to D1. This is where today's `services/*.ts` SQL ends up, organized by domain instead of mixed.
- **`Repositories`** bundle assembled in `index.ts` and stored on `c.var.repos`; routes use `c.var.repos.<domain>.<method>(...)`.

## 3. Domain inventory

Same call-pattern survey as v3, but **only the methods the existing code actually calls**. We are not building speculative methods.

| Repo | Methods (typed) | Backed-by today |
|---|---|---|
| `HostsRepository` | `getById`, `listActive`, `upsertIdentity`, `touchHeartbeat`, `setDescription`, `retire`, `unretire` | `routes/hosts.ts`, `routes/host-detail.ts`, `routes/identity.ts`, `routes/heartbeat.ts`, `routes/host-description.ts` |
| `MetricsRepository` | `appendTick`, `getLatest`, `readWindow`, `readHourly`, `getActiveHostIdsInHour` | `routes/ingest.ts`, `routes/metrics.ts`, `services/metrics.ts`, `services/aggregation.ts` |
| `AlertsRepository` | `listActive`, `listActiveByHost`, `setActive`, `clearActive`, `getPending`, `setPending`, `clearPending`, `countByHost` | `services/alerts.ts`, dashboard hosts list |
| `EventsRepository` | `append`, `listForHost`, `listFleet` | `routes/events-ingest.ts`, `routes/events-list.ts` |
| `WebhooksRepository` | `list`, `getById`, `upsert`, `delete` | `routes/webhooks.ts` |
| `PortAllowlistRepository` | `list`, `upsert`, `delete` | `routes/allowed-ports.ts` |
| `TagsRepository` | `list`, `getById`, `upsert`, `delete`, `addEdge`, `removeEdge`, `byEntity`, `byTag` | `routes/tags.ts`, `services/agents.ts` (tag join) |
| `SettingsRepository` | `get`, `set`, `delete` | `routes/settings.ts` |
| `MaintenanceRepository` | `list`, `getById`, `upsert`, `delete`, `activeAt(now)` | `routes/maintenance.ts`, alert evaluator |
| `AgentsRepository` | `list`, `listWithJoins`, `getById`, `upsertBy(source, match)`, `heartbeat`, `delete` | `services/agents.ts`, `routes/agents.ts` |
| `AssetsRepository` | `list`, `getById`, `upsert`, `delete` | `routes/assets.ts`, `services/assets.ts` |
| `BindingsRepository` | `list`, `byAgent`, `byAsset`, `upsert`, `delete` | `routes/bindings.ts`, `services/bindings.ts` |
| `Tier2Repository` | `getSnapshot`, `upsertSnapshot` | `routes/tier2-ingest.ts`, `routes/tier2-read.ts` |
| `CliTokensRepository` | `create`, `lookupByHash`, `revoke`, `prune(now)` | `routes/cli-auth.ts`, `services/cli-tokens.ts` |
| `AggregationRepository` (cron-only) | `aggregateHour(hourTs)`, `purgeRaw(olderThan)`, `purgeHourly(olderThan)` | `services/aggregation.ts`, cron handler |

Total: **15 repositories**, all method names mirror existing call sites. **No new domain operations are added.**

## 4. Architecture-simplification checks

The reviewer constraint is "架构简化" — easy to fail. Concrete tests we apply to the design:

1. **Net file count goes down or stays flat.** Today: ~25 route files + ~15 services + ~12 service test files. After: same routes + 15 repos + 15 adapters + ~15 contract tests. We *delete* the `services/*` files in the same commit that introduces the equivalent adapter — never both at once. Net change ≈ 0.
2. **No new abstraction levels.** Routes call repos. Repos call adapters. Adapters call D1. Three levels, one engine, no factory soup.
3. **No "Store" or "engine selector" interface.** With one engine there is nothing to select. `Repositories` is a plain record `{ hosts, metrics, alerts, ... }` instantiated once in `index.ts`. Adapters are imported directly; no DI container.
4. **Methods are concrete, not generic.** `metricsRepo.appendTick(host, payload)` not `store.put('m:r:'+host, ...)`. Generic `get/put/list` does not appear at the repo layer. Reviewer's v1 blocker on this stands.
5. **Routes lose all SQL.** Grep for `c.env.DB` and `db.prepare` outside `adapters/d1/` after the refactor → must be zero.
6. **Cron stays in one place.** `AggregationRepository.aggregateHour` is what the scheduled handler calls. No business logic in `index.ts`.

## 5. Test strategy

The constraint "测试覆盖率极高" plus "逻辑完全不变" gives a clear test pyramid:

### 5.1 Repo contract tests (the load-bearing tier)

For every repo: `packages/worker/test/repos/<domain>.contract.test.ts`. Tests are written against the **interface**, instantiated once per concrete adapter (today: only D1 via Miniflare's `D1Database` shim — same harness as the existing e2e tests). When a future engine is added, the same test file re-runs against it; for v4 we have one engine and one execution per test.

What every contract test must cover:

- Round-trip: write → read returns equal value.
- List ordering and pagination semantics for any list method.
- `upsertBy` / uniqueness behaviour (agents, settings, tags) — including the exact same conflict behaviour as today's `ON CONFLICT`.
- Index lifecycle: when an entity changes a key field that drives a join (e.g. `agents.match_key`), reads still return the right answer.
- Idempotency: calling `appendTick` twice with the same `(host_id, ts)` yields one row, like today's `INSERT OR IGNORE`.
- Negative paths: missing parent (FK), unknown id returning `null`, oversize input rejected by validation (where today's route enforces it).

### 5.2 Adapter unit tests

Per-adapter SQL-correctness sanity (`adapters/d1/*.test.ts`). These largely **port** the existing `services/*.test.ts` suites file-by-file. Since the SQL is unchanged, we expect every existing service test to lift to its adapter test with only an import-path change.

### 5.3 Route tests stay where they are

`packages/worker/src/routes/*.test.ts` keeps using a real Miniflare D1 (the existing setup). The only change: routes inject through `c.var.repos`. Test bodies do not change because behaviour does not change.

### 5.4 Existing E2E suite

`test/e2e/` runs unchanged against the real worker. Coverage of routes / pages gates stay green. We do **not** rely on E2E to catch repo-layer regressions; the contract tests do that.

### 5.5 Coverage targets

- Existing project gate: 95% line/branch (TS), 95% line (Rust). Untouched.
- New `repos/` (interface-only files; trivial): 100% by virtue of being type-only after compilation.
- New `adapters/d1/`: target **≥ 98% line + branch**. These are pure SQL functions; every branch is exercisable. Any line that we cannot test (e.g. a defensive "should never happen" return) gets explicit `/* c8 ignore next */` and a comment, never a coverage drop.
- Cron path (`AggregationRepository`): we add a Vitest scheduled-event test exercising one full hour's aggregation against synthetic raw rows.

## 6. Behaviour preservation

This is the constraint with the highest blast radius if violated. Mitigations:

1. **No SQL change.** Adapter methods carry today's SQL string verbatim from `services/*` and `routes/*` — line-for-line. Where SQL was inline in a route, we move it whole to the adapter; we do not rewrite or merge.
2. **No timestamp / RNG change.** Both `Date.now()` and any `crypto.randomUUID()` callers move to the same call sites in adapters; we don't introduce a clock or id factory.
3. **No JSON shape change.** Repos return the same DTOs the routes already construct today (most are typed in `@bat/shared`).
4. **Contract tests assert on row-level state.** After every write, contract tests query the underlying D1 directly and compare to expected state. This is the strongest possible assertion that the adapter has not silently regressed something.
5. **Diff sanity per commit.** Every C-step commit includes a `RUN_DIFF.md` artifact (added then removed in the cleanup commit) listing: every public function added, every public function removed, every test renamed. Reviewer reads this list before approving.
6. **Behaviour-equivalence sweep before C-final.** Before the last commit lands, we run the full e2e suite plus a snapshot test that hits every read endpoint with a fixed seed and compares JSON output bit-for-bit against the pre-refactor baseline (snapshot captured in C0).

## 7. Phasing

Eight atomic commits. Every commit ships green for the full pre-commit + pre-push gate stack (`lint`, `typecheck`, `test`, `gate:routes`, `gate:pages`, `gate:security`, coverage thresholds).

| # | Commit | Surface | Risk |
|---|---|---|---|
| C0 | Snapshot baseline test: capture JSON output of every read endpoint with a fixed-seeded D1, plus row counts after each write endpoint. Test asserts equal-to-snapshot. | new test file only | none — establishes the regression baseline used by C1–C7 |
| C1 | Add `repos/` interfaces (type-only) and an empty `Repositories` bundle wired into `c.var.repos`. No route uses it yet. | type contracts | none |
| C2 | Migrate **read-only** repos: `HostsRepository`, `WebhooksRepository`, `PortAllowlistRepository`, `SettingsRepository`, `MaintenanceRepository`, `Tier2Repository`. Adapters carry SQL verbatim from existing services. Their routes switch to `c.var.repos`. Old service files deleted in this same commit. | per-route | low — same SQL, new entry point |
| C3 | Migrate `TagsRepository`, `AssetsRepository`, `BindingsRepository`. Includes paired-edge / reverse-index methods (still SQL today, but exposed via the contract that a future KV adapter would honour). | per-route | low |
| C4 | Migrate `AgentsRepository`, `CliTokensRepository`. `upsertBy` uses today's `ON CONFLICT(source_key, match_key)` — no change. | per-route | low |
| C5 | Migrate `AlertsRepository`, `EventsRepository`. Both have specific list shapes and TTL-equivalent purge calls; preserve verbatim. | per-route | low |
| C6 | Migrate `MetricsRepository` + `AggregationRepository`. This is the largest single move (`metrics_raw` insert, hourly aggregation, purges). SQL unchanged. | cron + ingest | medium — most rows-touched |
| C7 | Cleanup: delete remaining `services/` files, remove dead imports, lift shared row types into `@bat/shared` if any duplicated. Re-run C0 snapshot test as the final equivalence check. | cleanup | low |

Estimated total: ~3-5 working days. C2-C5 can each be a half-day each if reviewer pace allows.

## 8. Architecture simplification — concrete deletions

What gets removed by the time C7 lands:

- `packages/worker/src/services/*.ts` — fully replaced by `adapters/d1/*.ts`. ~15 files net **moved**, not duplicated.
- All `c.env.DB` reads in `routes/*.ts` (currently 78 occurrences) — zero after C7.
- Inline SQL in route handlers — every `db.prepare(...)` outside `adapters/d1/` deleted.
- Repeated row-type definitions in routes — lifted into the adapter or `@bat/shared`.

What gets added:

- `packages/worker/src/repos/<15 files>.ts` — interfaces only, no logic.
- `packages/worker/src/adapters/d1/<15 files>.ts` — SQL, lifted from services.
- `packages/worker/test/repos/<15 contract test files>.ts`.

## 9. Open questions for @zheng-li

The previous question set is obsolete. Three new ones:

1. Confirm the C0 snapshot baseline approach is acceptable as the behaviour-equivalence gate. The alternative is a hand-written before/after request log; snapshot is cheaper and stricter.
2. Confirm that **deleting** `services/*.ts` in the same commit that adds the equivalent `adapters/d1/*.ts` is preferred over a deprecation period. (My recommendation: delete in same commit — one engine, no parallel paths to maintain.)
3. Confirm whether to keep the `services/` import alias for the migration window in case downstream tools (lint configs, IDE jump-to) reference it. (My recommendation: no alias; clean break inside one PR series.)

## 10. Non-goals (re-emphasized)

- No KV. No engine swap. No retention change.
- No new public API. No new domain operations beyond what current call sites already use.
- No coverage regression — the gate stays at 95% and we expect to clear it comfortably.
- No silent behaviour change. Anything visible to a caller, including alert evaluation timing and cron purge cadence, is identical.
