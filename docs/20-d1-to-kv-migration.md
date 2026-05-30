# 20 — D1 → CF KV Migration Design

> Status: Draft v1 · Owner: @MBP-SDE-A · Reviewer: @MBP-Reviewer-A · For: @zheng-li
> KV namespace: `bat` (id `57d8209ea2394f4cb76436a964b5618b`)

## 1. Goals & Constraints

| # | Requirement | Source |
|---|-------------|--------|
| G1 | Replace D1 with CF KV as the worker's primary store | task |
| G2 | Retain only the **last 7 days** of every dataset; older data discarded | task |
| G3 | **No D1 → KV data migration** (greenfield switch) | task |
| G4 | Refactor first to a **storage-engine-agnostic API layer**, then swap engines | task |
| G5 | Keep ≥ 95% line/branch coverage, clean layering, idiomatic for this codebase | task |
| G6 | Apply **delta-suppression** on per-metric ingest (drop sample if change < 1%); reader fills gaps via forward-extension | task |
| G7 | Bridge / browser / probe API surfaces and behaviour stay identical | implied |

## 2. Current Storage Surface (what we are abstracting)

Source survey: `packages/worker/src/{routes,services}/`. ~78 direct `c.env.DB` references across 25 route files and ~15 service files. The data is grouped into the following logical stores:

| Store | Today (D1 tables) | Volatility | Read pattern | Write pattern |
|---|---|---|---|---|
| **Hosts** (identity + inventory) | `hosts` (+ inventory cols) | low | by `host_id`, list active | upsert on identity / heartbeat |
| **Raw metrics** | `metrics_raw` | high (every probe tick) | by host range scan `(host_id, ts)` | append-only |
| **Hourly metrics** | `metrics_hourly` | medium (cron) | by host range scan `(host_id, hour_ts)` | upsert per hour |
| **Tier-2 snapshots** | `tier2_snapshots` | low (1/host/day-ish) | latest per host | upsert |
| **Alerts** | `alert_states`, `alert_pending` | low | active set | upsert / delete |
| **Events** | `events` | low/medium | recent per host | append + cleanup |
| **Webhook configs** | `webhook_configs` | very low | full list | CRUD |
| **Allowed ports** | `port_allowlist` | very low | full list | CRUD |
| **Tags** | `tags`, `host_tags`, `agent_tags`, `asset_tags` | low | by entity / by tag | CRUD |
| **Settings** | `settings` (kv-style) | very low | by key | CRUD |
| **Maintenance windows** | `maintenance_window` | very low | active list | CRUD |
| **Agents / Assets / Bindings** (CLI domain) | `agents`, `assets`, `agent_asset_bindings` | low/medium | by id, list | CRUD |
| **CLI tokens** | `cli_tokens` | low | by token hash | insert + lookup |
| **Top processes / disk_io / etc.** | columns/JSON inside `metrics_raw` | with metrics | with metrics | with metrics |

Two distinct cron paths exist today:

- `aggregateHour` — joins `metrics_raw` × `hosts`, writes `metrics_hourly`.
- D1 purge of `metrics_raw` (>7d) and `metrics_hourly` (>retention).

Both are **D1-shaped**: `JOIN`, `DISTINCT`, multi-statement transactions. Neither survives a 1:1 KV port. We replace them with KV-native equivalents (§5, §7).

## 3. Architecture: Storage Engine Abstraction (G4)

### 3.1 Layering target

```
routes/*  ─────────────────► repos/*  ─────────────────►  store/*           ──► binding
   (HTTP, validation,           (domain ops, types,            (engine driver:        D1Database
    response shape)              business invariants)           D1 today, KV next)    or KVNamespace
```

- **routes/** — unchanged behaviour; only swap import sources from `services/*` (D1 SQL) to `repos/*` (interface). No `c.env.DB` reads in routes after the refactor.
- **repos/** (new) — **engine-agnostic** domain modules: `hostsRepo`, `metricsRepo`, `alertsRepo`, `eventsRepo`, `webhookRepo`, `tagsRepo`, `settingsRepo`, `agentsRepo`, `assetsRepo`, `bindingsRepo`, `tokensRepo`, `maintenanceRepo`, `tier2Repo`, `aggregationRepo`. Each takes a `Store` instance and exposes typed methods (`get`, `list`, `upsert`, `delete`, `range`, `appendMetric`, …). **No** SQL or KV calls here directly.
- **store/** (new) — minimal capability interface (§3.2) with two implementations: `D1Store` (preserves current behaviour during transition) and `KvStore` (new, target).
- Cron entry points and the `c.env.STORE` accessor are wired in `index.ts` / `services/aggregation.ts`.

### 3.2 Store interface (capability shape)

The smallest set that covers every existing pattern:

```ts
export interface Store {
  // Single-key CRUD
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T, opts?: { ttlSeconds?: number }): Promise<void>;
  delete(key: string): Promise<void>;

  // Prefix iteration (sorted, paginated)
  list<T>(prefix: string, opts?: { limit?: number; cursor?: string }):
    Promise<{ items: { key: string; value: T }[]; cursor: string | null }>;

  // Append + range read for time series (semantics defined in §5)
  appendSeries<T>(seriesKey: string, ts: number, value: T, opts: { ttlSeconds: number }): Promise<void>;
  readSeries<T>(seriesKey: string, fromTs: number, toTs: number): Promise<{ ts: number; value: T }[]>;
}
```

`D1Store` translates these to today's SQL; `KvStore` uses the KV binding plus the layout in §4. Once routes/repos compile against `Store`, switching the binding is a one-line swap in `index.ts`.

### 3.3 Why repos sit between routes and store

It keeps **business invariants** (e.g. "delta-suppress before write", "host record must exist before metric append") out of routes and out of the engine driver, where they would either be duplicated per route or coupled to D1 SQL. Repos are also where contract tests run against both `D1Store` and `KvStore` — same test suite, two engines, ensures behavioural parity during the swap.

## 4. KV Layout (`bat` namespace)

KV is a **flat key-value store with prefix scan**. We encode the schema in the key path:

| Logical store | Key shape | Value | Comment |
|---|---|---|---|
| Host record | `host:{host_id}` | `HostRecord` JSON | hot; small |
| Host index (list active) | `idx:host:active:{lastSeenDescIso}:{host_id}` | `""` | secondary index for "list hosts by recency"; rebuilt on identity/heartbeat |
| **Raw metric tick** | `m:r:{host_id}:{tsZeroPad}` | compact metric JSON (or msgpack) | TTL = 7d (G2). `tsZeroPad` is `ts.toString().padStart(10,"0")` so prefix scan is time-ordered. |
| Last-persisted ref (per metric per host) | `m:last:{host_id}` | `LastPersistedRef` (per-field last value + ts) | drives delta-suppression (§5) |
| Hourly bucket | `m:h:{host_id}:{hourTsZeroPad}` | hourly aggregate JSON | TTL = 7d (G2 — supersedes prior 90d behaviour) |
| Tier-2 snapshot | `t2:{host_id}` | latest snapshot JSON | one-key-per-host, overwrite |
| Alert state (active) | `alert:state:{host_id}:{rule_id}` | `AlertState` JSON | delete on resolve |
| Alert pending | `alert:pending:{host_id}:{rule_id}` | `AlertPending` JSON | delete on promotion / resolve |
| Event | `evt:{host_id}:{tsZeroPad}:{seq}` | `EventRecord` JSON | TTL = 7d |
| Webhook config | `wh:{id}` | `WebhookConfig` | small set; full list is `list("wh:")` |
| Port allowlist | `port:{id}` | `PortAllowlist` | full list is `list("port:")` |
| Tag | `tag:{tag_id}` | `Tag` | + edge keys: `tagedge:{kind}:{entity_id}:{tag_id}` |
| Settings | `set:{key}` | scalar/JSON | |
| Maintenance | `maint:{id}` | `MaintenanceWindow` | |
| Agent | `agent:{id}` | `Agent` | |
| Asset | `asset:{id}` | `Asset` | |
| Binding | `bind:{agent_id}:{asset_id}` | `Binding` | both directions covered by additional `bindrev:{asset_id}:{agent_id}` |
| CLI token | `cli:tok:{token_hash}` | `CliToken` | TTL = expiry |

Notes:

- Time-series reads use `list({ prefix: "m:r:{host_id}:" , start: "m:r:{host_id}:{fromZ}", end: ... })`. Zero-padded numeric strings are crucial for sort order.
- KV provides per-key `expirationTtl` — we set it on every series/event write so we never need an explicit purge job (replaces the old D1 purge cron).
- All values are JSON unless noted (msgpack is a future option if size matters).
- We do **not** use KV metadata for primary data; metadata is reserved for low-cardinality flags (e.g. `compressed=1`) where useful.

### 4.1 Eventual consistency

Workers KV is eventually consistent (~60s globally). For our access patterns:

- Hot host record reads (`host:{id}`) tolerate ~minute staleness — already the case for D1 readers behind cron.
- Metric writes are append-only and keyed by `(host_id, ts)`; concurrent overwrites only happen if the same probe sends the same `ts` twice (idempotent — same row).
- Alerts are evaluated in cron, single-writer; no read-modify-write race with route handlers.
- We never require "read your write" inside a single request, so KV's model fits.

## 5. Delta-Suppression Compression (G6)

### 5.1 Algorithm (write path)

For every numeric field in an incoming `MetricsPayload`, the repo computes the relative delta against the **last-persisted ref** for that host:

```ts
function shouldRecord(prev: number | null, next: number | null): boolean {
  if (prev === null || next === null) return true;
  if (prev === next) return false;
  if (prev === 0) return Math.abs(next) >= 0.01;          // avoid div-by-zero; treat as new value
  return Math.abs((next - prev) / prev) >= 0.01;          // ≥ 1% relative change
}
```

A sample is **persisted** if any tracked field crosses its threshold; otherwise the entire tick is **dropped**. This preserves the per-tick consistency of multi-field samples (we never partially persist a tick).

The "last persisted ref" lives at `m:last:{host_id}` and is updated atomically with the metric write. Because KV has no compare-and-swap, we use a **read-then-write** sequence with the assumption that a single host has a single probe writer (current architecture); concurrent identical writes converge.

Tracked fields (initial set, expandable): `cpu_usage_pct`, `cpu_load1`, `cpu_load5`, `cpu_load15`, `mem_used_pct`, `swap_used_pct`, plus disk per-mount `used_pct` and net per-iface `rx_bytes_rate` / `tx_bytes_rate`. Counters (e.g. `oom_kills_delta`) are always recorded — they are deltas, not levels.

### 5.2 Forward-fill on read (chart path)

The reader returns `(ts, value)` rows from `m:r:{host_id}:` for the requested window. The chart component (and any consumer needing per-second resolution) treats absence as "value held since last sample" — i.e. it forward-extends the previous point until either the next sample or the requested `toTs`. The renderer/SDK helper does the fill; the API contract documents that gaps mean "unchanged within ±1%".

We add one helper in `@bat/shared`: `expandSeries<T>(rows, fromTs, toTs, stepSec): T[]` — pure function, fully unit-tested.

### 5.3 Boundary semantics

- Always record the **first** sample after a probe restart (detectable via `boot_time` change or `m:last:{host_id}` absence).
- Always record at least one sample per **hour** even if nothing crossed threshold (anchors the hourly aggregator and makes long-flat charts auditable). Implemented as: `if (now - lastPersistedTs >= 3600) record`.
- Drop only the tick; never silently discard alerts / events / inventory updates that ride alongside metrics.

## 6. Hourly Aggregation (cron)

D1 today does the aggregation in SQL. Under KV we do it in code, in the same cron worker:

```
for each host with activity in [hourTs, hourTs+3600):
  rows = readSeries("m:r", host, hourTs, hourTs+3600)
  agg  = computeHourly(rows)              // pure function
  put("m:h:{host}:{hourTs}", agg, ttl=7d)
```

"Hosts with activity" is computed by listing recent prefix scan on `m:r:` once per cron tick and bucketing to host. This is cheaper than the JOIN it replaces because we already have prefix-scan listings without a join.

## 7. Cost model (rough)

KV pricing dimensions: **reads**, **writes**, **list operations**, **storage GB-months**.

- Writes: probe sends 1 tick / 30s = 2880/day/host. Delta-suppression cuts this typically 60-90% on stable hosts → ~300-1200/day/host. With 7d TTL, steady-state write rate is the same as ingest rate (no purge writes). Plus 1 hourly aggregate / host = 24/day/host.
- Reads: chart queries do prefix scan; a 24h window with a typical 1-min effective resolution is ~1440 rows. List op cost dominates over per-key read cost; we'll measure once on staging before extrapolating.
- Storage: a single tick JSON is ~1.5 KB raw, ~0.6 KB after dropping null fields. With 1000 ticks/host/day × 7d × 0.6 KB ≈ 4.2 MB/host. Plus ~170 hourly entries / host. For 100 hosts ≈ 420 MB — well within free tier.

We will instrument write/read counts in tests and dump them into `docs/` after the first staging run, before extrapolating production cost.

## 8. Test strategy (G5)

Two layers, each with its own coverage target:

1. **Repo contract tests** (run against both stores): a single suite under `packages/worker/test/repos/*.contract.test.ts` parameterized by store factory. Each repo has a contract: identity round-trip, list semantics, range read, TTL behaviour (mocked clock for KV), delta-suppression decisions, forward-fill expansion.
2. **Engine adapter tests**: targeted unit tests for `D1Store` (already covered by today's suite, kept) and `KvStore` (new). KV adapter tests use **Miniflare**'s `KVNamespace` shim for in-process testing — no remote calls.
3. **Existing route tests** (`packages/worker/src/routes/*.test.ts`) keep passing unchanged: they consume the same route handlers with whichever `Store` is wired.
4. **E2E** (`packages/worker/test/e2e/*`): unchanged surface; adds 2 specs covering `expandSeries` correctness and the "hourly anchor" rule.

Coverage gate stays at 95% (TS) / 95% (Rust). The L2 route coverage gate, which already enforces every declared route has an E2E request, continues to run.

## 9. Phasing & Atomic Commits

The work is split so each commit ships green tests and CI gates. Before-each-commit gates: `lint`, `typecheck`, `test`, `gate:routes`, `gate:pages`, `gate:security` (i.e. existing pre-commit + pre-push).

| # | Commit | Surface | Risk |
|---|---|---|---|
| C1 | Introduce `store/` interface + `D1Store` (no behaviour change; routes still call services/SQL) | new files only | none |
| C2 | Introduce `repos/` and route-by-route migrate handlers + their unit tests onto repos backed by `D1Store` | per-route | low — existing engine, new layer |
| C3 | Add `KvStore` (Miniflare-tested) implementing the full Store interface | new files only | low |
| C4 | Implement KV-native `aggregateHour` + drop the D1 purge job (KV TTL replaces it) | cron path | medium — exercises real write/read on staging |
| C5 | Implement delta-suppression (`m:last:` + `shouldRecord`) and `expandSeries` helper | metrics path | medium — covered by contract + chart tests |
| C6 | Wire `KvStore` into `c.env.STORE` for non-prod env, add KV binding to `wrangler.toml`, smoke on staging | config | medium |
| C7 | Production cutover: bind KV in `[env.production]`, drop the D1 binding (keep migrations file untouched per G3) | config | high — gated by manual confirmation |
| C8 | Remove `D1Store` and dead D1 services after a soak period (separate PR window) | cleanup | low (post-soak) |

C1–C5 are reviewable independently; C6 is the first commit that requires user-side action (provide KV namespace binding for both prod and dev envs, plus any Wrangler-secret housekeeping).

## 10. Open questions / I need from @zheng-li

- Confirm cutover is one-shot at C7 (no parallel-write period, since D1 has no migration to sync against).
- Confirm 7-day TTL also applies to **hourly** metrics (today retained 90d). Concise read of the task says yes ("KV存储7天数据") but worth flagging — 7d hourly means dashboards can't show >7d trends.
- Confirm willingness to add KV binding to both `wrangler.toml` (dev) and `[env.production]` at C6/C7. (CLI token + Cloudflare token already exist; I'll handle the wrangler edits.)
- "1% drift" applies to relative change. OK to keep absolute floor (e.g. always record sub-1% changes for `cpu_usage_pct < 1`)? Default plan: yes for `cpu_usage_pct`, percentile-style fields stay absolute-floored at 0.5 percentage points to preserve idle-state noise.

## 11. Non-goals

- No D1 → KV backfill (G3).
- No durable-objects, no R2, no Queues — KV alone (per task scope).
- No new public API contract changes; charts stay backward-compatible after the `expandSeries` helper lands client-side.
- No production cutover before reviewer + user sign-off on this doc.
