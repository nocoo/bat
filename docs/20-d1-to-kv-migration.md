# 20 — Phase 1: D1 Repository Refactor (v5)

> Status: Draft v5 (v4 + 5 reviewer execution-edge fixes) · Owner: @MBP-SDE-A · Reviewer: @MBP-Reviewer-A · For: @zheng-li
> Phase 1 = D1-only. **No KV** in this design. v1–v3 KV designs remain in git history (`00ec0a8`, `3b74fda`, `975ff57`) for if/when engine swap is revisited.

## 0. Changelog

### v4 → v5 (this revision)

| # | v4 issue (reviewer) | v5 fix |
|---|---|---|
| P1 | "Delete `services/*` wholesale" conflates DB access with business logic & middleware glue | §3 splits `services/*` into three buckets: **DB access** → `adapters/d1/*`, **pure business/derivation** → `domain/*`, **stay put** (used by middleware) → `services/*` remains. Acceptance becomes "routes/middleware/cron never touch `c.env.DB` directly; SQL only lives in `adapters/d1/`". |
| P2 | C2 too wide; C6 too wide | §7 phasing rewritten as **11 atomic commits**, each touches 1–2 domains. `hosts`, `metrics`, `aggregation` each get their own commit. |
| P3 | `c.var.repos` wiring under-specified | §4 adds the typing for `Variables`, a `reposMiddleware`, fake-repo injection pattern for route unit tests, and the scheduled-handler wiring. Concrete code shape included. |
| P4 | "bit-for-bit every read endpoint" snapshot is brittle | §6 reframes C0 as **normalized snapshots** — fixed clock + fixed seed + fixed auth keys, redacted volatile fields (timestamps, generated ids), explicit list of covered endpoints. Not all endpoints; the critical reads only. |
| P5 | "methods mirror call sites" risks shallow SQL wrappers | §3.5 adds the **repo inclusion rule**: only logic with SQL **and** (joins / FK / invariant / multi-route reuse / non-trivial test value) goes through a repo. Thin one-shot SQL stays inline OR moves to a domain helper; we don't create a method just to host a single-statement select. |

## 1. Goal & non-negotiables

- **Goal**: Move D1 access behind a domain-repository layer so routes / middleware / cron never call `c.env.DB` directly.
- **Hard constraints** (per @zheng-li):
  1. **Architecture must simplify** — fewer entities, sharper boundaries.
  2. **Test coverage stays ≥ 95%**; adapters target ≥ 98%.
  3. **Zero behaviour change.** Every API response, status code, alert fire, cron output, and DB write is identical before and after.
- **Out of scope**: KV, retention changes, compression, schema changes, new public endpoints, new domain methods beyond current call sites.

## 2. Why this is worth doing alone

(Unchanged from v4.) 78 `c.env.DB` references in 25 route files; `services/*` is a mixed bag of DB code + pure business logic; route tests have no shared seam to mock. A repo layer fixes all of this with one concept and is independently valuable even with one engine.

## 3. Where current `services/*` lives in v5

`services/*` is **not a single bucket**. We classify each file by what it actually does and route it accordingly. Acceptance criterion is **not** "`services/` directory is empty" — it is **"routes/middleware/cron never touch `c.env.DB` directly; SQL only lives in `adapters/d1/`"**.

### 3.1 Classification

| File | Today's content | v5 destination |
|---|---|---|
| `services/metrics.ts` | D1 insert builders for `metrics_raw`, host upsert | `adapters/d1/metrics.ts` |
| `services/agents.ts` | List/get/upsert/heartbeat agents with FK joins, ON CONFLICT | `adapters/d1/agents.ts` |
| `services/assets.ts` | Asset CRUD over D1 | `adapters/d1/assets.ts` |
| `services/bindings.ts` | Binding CRUD over D1 | `adapters/d1/bindings.ts` |
| `services/cli-tokens.ts` | Token create/lookup over D1 (used by `middleware/api-key.ts` via dynamic import) | `adapters/d1/cli-tokens.ts`; middleware gets the repo via `c.var.repos` (no dynamic import) |
| `services/aggregation.ts` | Hourly aggregation + purge — mixes D1 reads/writes with pure compute | Split: SQL parts → `adapters/d1/aggregation.ts`; pure roll-up math → `domain/aggregation.ts` |
| `services/events.ts` | Event insert + list over D1 | `adapters/d1/events.ts` |
| `services/heartbeat.ts` | Host `last_seen` update | folded into `adapters/d1/hosts.ts` |
| `services/alerts.ts` | Alert evaluation (pure rules from MetricsPayload + thresholds) | `domain/alerts/evaluate.ts` (pure); persistence (`alert_states`, `alert_pending`) moves to `adapters/d1/alerts.ts` |
| `services/tier2-alerts.ts` | Pure tier-2 evaluation rules | `domain/alerts/tier2.ts` |
| `services/tier2-metrics.ts` | Tier2 snapshot upsert/read | `adapters/d1/tier2.ts` |
| `services/status.ts` | Pure host-status derivation from alerts | `domain/status.ts` (pure; no DB) |

Two files **keep their name and path** because they have neither SQL nor non-trivial business logic: none, after classification. So after v5 lands, the `services/` directory is empty and can be removed.

But the acceptance is not "directory removal"; that's just the natural consequence of correct classification.

### 3.2 `domain/` is new and pure

Files in `packages/worker/src/domain/` are **pure functions** — no I/O, no `c.env`, no `D1Database`. They take typed inputs and return typed outputs. They're trivially testable.

Today's pure logic that ends up in `domain/`:
- `domain/status.ts` (host status derivation)
- `domain/alerts/evaluate.ts` (tier-1 / signal-expansion / tier-3 rules)
- `domain/alerts/tier2.ts`
- `domain/aggregation.ts` (the compute part of `aggregateHour`)

`domain/` is not a repo. Routes / repos can both call into it without coupling.

### 3.3 Middleware that needs a repo

`middleware/api-key.ts` currently does a **dynamic** `import('../services/cli-tokens.js')`. In v5 the middleware reads `c.var.repos.cliTokens.lookupByHash(...)`. No dynamic imports. This is part of the C1 wiring.

### 3.4 Acceptance for §3

After C11:

```bash
# These should all return 0
grep -rn "c\.env\.DB" packages/worker/src/routes packages/worker/src/middleware
grep -rn "db\.prepare\|D1Database" packages/worker/src/routes packages/worker/src/middleware packages/worker/src/domain
```

And the `gate:routes`/`gate:pages` coverage gates plus the 95% unit-coverage gate stay green at every commit boundary.

### 3.5 Repo inclusion rule (P5)

A `Repository` method exists **only if** it carries SQL **and** at least one of:

- a JOIN or FK-aware read that is hard to inline,
- a uniqueness / invariant (`ON CONFLICT`, derived-id generation, ordered side-effects),
- reuse across ≥ 2 routes or by cron / middleware,
- non-trivial behaviour worth its own contract test.

A one-shot `db.prepare("SELECT 1 FROM settings WHERE key = ?")` does **not** become a repo method unless it meets the rule. The route or a `domain/` helper holds it. We are not auto-generating thin wrappers.

This is the rule reviewers should hold us to in C2-C9.

## 4. `c.var.repos` wiring (concrete)

### 4.1 Types

```ts
// packages/worker/src/repos/types.ts
export interface Repositories {
  hosts: HostsRepository;
  metrics: MetricsRepository;
  alerts: AlertsRepository;
  events: EventsRepository;
  webhooks: WebhooksRepository;
  ports: PortAllowlistRepository;
  tags: TagsRepository;
  settings: SettingsRepository;
  maintenance: MaintenanceRepository;
  agents: AgentsRepository;
  assets: AssetsRepository;
  bindings: BindingsRepository;
  tier2: Tier2Repository;
  cliTokens: CliTokensRepository;
  aggregation: AggregationRepository;
}
```

```ts
// packages/worker/src/types.ts
export type Variables = {
  accessAuthenticated?: boolean;
  repos: Repositories; // ← added in C1
};
```

### 4.2 Factory + middleware

```ts
// packages/worker/src/repos/factory.ts
import { D1HostsRepository } from "../adapters/d1/hosts.js";
// … one import per adapter …

export function createD1Repositories(db: D1Database): Repositories {
  return {
    hosts:       new D1HostsRepository(db),
    metrics:     new D1MetricsRepository(db),
    // … one per repo …
  };
}
```

```ts
// packages/worker/src/middleware/repos.ts
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types.js";
import { createD1Repositories } from "../repos/factory.js";

export const reposMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("repos", createD1Repositories(c.env.DB));
  await next();
};
```

Mounted once near the top of the route tree in `index.ts`, **before** `entry-control` / `access-auth` so all downstream middleware (including `api-key`) can read `c.var.repos`.

Adapter constructors are cheap (just store the `db` reference); per-request instantiation is fine and avoids any global-state cache.

### 4.3 Scheduled handler

```ts
// packages/worker/src/index.ts
async scheduled(event, env, ctx) {
  const repos = createD1Repositories(env.DB);
  await repos.aggregation.aggregateHour(currentHourStart());
  await repos.metrics.purgeRawOlderThan(now - 7 * 86400);
  // …
}
```

No `c.var.repos` here because there's no Hono context — we use the factory directly. Same `Repositories` type, same adapters.

### 4.4 Route unit-test injection

```ts
// packages/worker/test/helpers/fakeRepos.ts
export function makeFakeRepos(overrides: Partial<Repositories> = {}): Repositories {
  return { hosts: stubHosts(), metrics: stubMetrics(), /* … */, ...overrides };
}
```

Route unit tests construct a Hono app, set `c.var.repos = makeFakeRepos({ hosts: customStub })`, and assert on stubbed calls / response shape. Real-D1 route tests (existing setup) inject `createD1Repositories(env.DB)` via the same middleware path — no test change there.

## 5. Domain inventory (unchanged shape from v4, refined per §3.5)

15 repos, methods strictly tied to current call sites. Same table as v4 §3. Two refinements:

- `SettingsRepository.{get,set,delete}` stays as a repo because settings are used from multiple routes and middleware (`getRetentionDays` used by cron and by the settings endpoint). Even though each method is a single statement, it meets the "reuse across ≥ 2 callers" bar.
- `HostsRepository` does **not** get a `getStatus(...)` method — status derivation is pure (`domain/status.ts`) and routes call the pure helper after fetching the rows they need. The repo only returns rows.

## 6. Test strategy + C0 normalized snapshot (P4)

### 6.1 Contract tests

Every repo has `test/repos/<domain>.contract.test.ts`. They run against the real (Miniflare) D1 binding and assert the same observable behaviour as today's services tests. The contract test file is the **source of truth** for what each method must do; reviewers point at it during route migrations.

### 6.2 Adapter SQL tests

Existing `services/*.test.ts` files lift to `adapters/d1/*.test.ts` with import paths updated. SQL is unchanged → assertions are unchanged. Coverage target ≥ 98% line + branch.

### 6.3 Route tests (real D1) stay; route unit tests (fake repos) optional

We don't *replace* the existing route-against-real-D1 tests — they're our integration safety net. New route-unit tests with `makeFakeRepos` may be added where the route logic is complex enough (validation tables, branching responses); we add them opportunistically, not as a mandate.

### 6.4 C0 normalized snapshot baseline (replaces v4's bit-for-bit)

A single file `packages/worker/test/baseline/api-snapshot.test.ts` that:

1. Sets up a fixed seed:
   - Clock pinned via `vi.useFakeTimers().setSystemTime(new Date('2026-05-30T00:00:00Z'))`.
   - Auth headers fixed (the test `BAT_*_KEY` from `globalSetup`).
   - Database seeded by a small fixture: 3 hosts, 30 raw rows / host, 2 alerts, 1 webhook, 1 maintenance window, 2 agents, 2 assets, 2 bindings, 1 cli token.
2. Hits a **defined set of read endpoints** (the critical ones — listed in §6.5).
3. For each response, normalizes:
   - Strip `timestamp`, `created_at`, `updated_at`, `last_seen`, `triggered_at`, etc. to `"<TS>"`.
   - Strip generated ids (`agent.id`, `asset.id`, `binding.id`, `cli_token.id`) to `"<ID>"`.
   - Sort arrays whose order is documented as unstable.
4. Compares to a checked-in JSON snapshot.

The snapshot is captured **once** at C0, before any refactor; every subsequent commit must keep it green. C11 deletes nothing about this file — it's a permanent regression guard.

### 6.5 C0 coverage list

The C0 snapshot covers:

- `GET /api/hosts`
- `GET /api/hosts/:id`
- `GET /api/hosts/:id/metrics?window=24h`
- `GET /api/hosts/:id/metrics?window=7d`
- `GET /api/alerts`
- `GET /api/maintenance`
- `GET /api/webhooks`
- `GET /api/allowed-ports`
- `GET /api/agents`
- `GET /api/assets`
- `GET /api/bindings`
- `GET /api/tags`
- `GET /api/settings`
- `GET /api/fleet-status`
- `GET /api/live` (limit 10)

Write endpoints aren't snapshotted directly (volatile by design); instead the snapshot test does `PATCH /api/hosts/:id/description`, then re-fetches `GET /api/hosts/:id`, then asserts the description changed and the rest of the JSON did not. Similar pattern for `POST /api/identity`, `POST /api/metrics`, `POST /api/events`, `POST /api/maintenance`, the agents/assets/bindings CRUD, and the cron `aggregateHour` invocation.

This is the realistic version of "bit-for-bit": targeted, normalized, fast, deterministic.

## 7. Phasing — 11 atomic commits (P2)

Each commit ships green for `lint` + `typecheck` + `test` + `gate:routes` + `gate:pages` + `gate:security` + coverage gates. Each commit has a single reviewable theme.

| # | Commit | Scope |
|---|---|---|
| C0 | **Baseline snapshot test** (§6.4) — pre-refactor capture | new test file only |
| C1 | `Repositories` type, `createD1Repositories` factory, `reposMiddleware`, `Variables.repos` wired into Hono; scheduled handler uses factory directly. No routes consume it yet; adapters are empty stubs (re-exporting today's service functions to make wiring compile + green). | wiring only |
| C2 | `SettingsRepository` + `WebhooksRepository`. Smallest blast radius. Includes their contract tests. Adapters carry SQL verbatim. Routes switch. Old service files deleted. | 2 domains |
| C3 | `PortAllowlistRepository` + `MaintenanceRepository` (incl. `activeAt(now)` used by alerts cron). | 2 domains |
| C4 | `Tier2Repository` + `TagsRepository` (tags include paired edge/reverse SQL). | 2 domains |
| C5 | `AssetsRepository` + `BindingsRepository`. | 2 domains |
| C6 | `AgentsRepository` + `CliTokensRepository`. `upsertBy` keeps today's `ON CONFLICT(source_key, match_key)`. Middleware `api-key` switches to `c.var.repos.cliTokens` (drops dynamic import). | 2 domains |
| C7 | `AlertsRepository` (state + pending CRUD only). Move alert evaluation pure logic to `domain/alerts/{evaluate,tier2}.ts` in the same commit (no behaviour change; same inputs, same outputs). | 1 domain + 1 domain helper extraction |
| C8 | `EventsRepository`. | 1 domain |
| C9 | `HostsRepository` — read paths (`list`, `getById`) + status helper extraction to `domain/status.ts`. Dashboard list logic stays in route; only the data access moves. | 1 domain (read) |
| C10 | `MetricsRepository` (`appendTick`, `getLatest`, `readWindow`, `readHourly`, `getActiveHostIdsInHour`) + remaining write paths on `HostsRepository` (`upsertIdentity`, `touchHeartbeat`, `setDescription`, `retire`/`unretire`). Largest single move (`metrics_raw` insert). | 1 large domain + finish hosts |
| C11 | `AggregationRepository` (`aggregateHour`, `purgeRaw`, `purgeHourly`). Pure roll-up math lives in `domain/aggregation.ts`. Cron handler uses the factory. Final cleanup: remove `services/` if empty, delete `RUN_DIFF.md`, re-run C0 snapshot test. | cron + cleanup |

Total: **11 commits + 1 baseline (C0)**. Reviewer-friendly per-commit scope, no single commit larger than ~600-800 LOC including tests. Estimated 4–7 working days end-to-end depending on review pace.

## 8. Architecture-simplification checks (with concrete targets)

After C11, the following invariants hold and are enforced by grep tests in CI:

1. `grep -rn "c\.env\.DB" packages/worker/src/{routes,middleware,domain}` → **0 hits**.
2. `grep -rn "db\.prepare\|D1Database" packages/worker/src/{routes,middleware,domain}` → **0 hits**.
3. `services/` directory is empty or deleted.
4. Total `packages/worker/src` LOC: **delta ≤ +5%** vs pre-refactor (we move > add).
5. Route file LOC delta: **≤ -10%** on average (SQL strings move out).
6. Existing test count grows (contract + baseline) but **per-test setup LOC shrinks** in route tests — measured as average lines between `describe(` and the first `test(` block.

## 9. Behaviour preservation guards (re-emphasized)

1. SQL strings copied verbatim into adapters.
2. Clock/RNG call sites unchanged.
3. JSON shape unchanged (existing types in `@bat/shared` are reused).
4. Contract tests assert on D1 row state after each write.
5. C0 normalized snapshot runs after every commit.
6. `RUN_DIFF.md` per commit lists new/removed/renamed public symbols.

## 10. Open questions for @zheng-li

None remaining — the previous v4 §9 questions were answered in your "同意，开始 v5" message:

1. C0 normalized snapshot is the gate ✓
2. Same-commit delete of moved `services/*` ✓
3. No alias for `services/` ✓

The fourth item from v4 — what to do with files like `services/status.ts` and `services/alerts.ts` that aren't DB access — is resolved by §3 above (they move to `domain/`, not `adapters/d1/`).

## 11. Non-goals (unchanged from v4)

No KV, no engine swap, no retention change, no new public API, no new domain methods beyond current call sites, no coverage regression, no silent behaviour change.
