# 20 — D1 → CF KV Migration Design

> Status: Draft v2 (addresses v1 reviewer blockers) · Owner: @MBP-SDE-A · Reviewer: @MBP-Reviewer-A · For: @zheng-li
> KV namespace: `bat` (id `57d8209ea2394f4cb76436a964b5618b`); proposed binding name **`BAT_KV`**.

## 0. v1 → v2 changelog

| # | v1 problem | v2 fix |
|---|---|---|
| B1 | One KV key per metric tick → list/get explosion | **Bucket-per-hour value** holding tick array; per-host `latest` and `last-ref` keys (§5) |
| B2 | Generic `Store{get/put/list/...}` interface mis-models business queries | Primary abstraction is **domain repositories**; `KeyValueStore` is internal to the KV adapter only (§3) |
| B3 | 1% **relative** threshold misreads the user's CPU example | Per-field **comparator policy**: percentage-point threshold for `*_pct`, relative+floor for bytes/rates, always-write for counters (§6) |
| B4 | Hourly aggregator over sparse rows produces biased stats | Hourly uses **time-weighted aggregation** over expanded series; `sample_count` semantics defined (§7) |
| B5 | "7d on every dataset" conflates telemetry with config | Datasets split into **ephemeral** (TTL 7d) vs **durable** (no TTL); user-facing question reflects this (§4, §11) |
| B6 | Secondary indexes had no lifecycle | Each index has explicit create / replace / delete / TTL rules and a current-pointer key (§4.5) |
| B7 | Concurrency story too optimistic | Concurrency table per operation; idempotent designs called out; `m:last:{host}` TTL covers downtime (§8) |

## 1. Goals & Constraints (unchanged from v1)

| # | Requirement |
|---|---|
| G1 | Replace D1 with CF KV as the worker's primary store |
| G2 | Retain only the **last 7 days** of **ephemeral** datasets (telemetry, events) — see §4 / §11 for the durable-data carve-out |
| G3 | **No D1 → KV data migration** (greenfield switch) |
| G4 | Refactor first to a **domain-repo API layer**, then swap engines |
| G5 | ≥ 95% line/branch coverage, clean layering |
| G6 | Per-field delta-suppression on ingest; reader fills gaps |
| G7 | API surfaces unchanged from caller perspective |

## 2. Storage surface (concrete contracts, not generic CRUD)

To address B2, this is the actual call-pattern inventory the repos must satisfy. Each row is a **business operation** the routes/cron use today; the new `repos/*` layer exposes exactly these as typed methods.

### 2.1 Hosts (durable)

| Op | Caller | Notes |
|---|---|---|
| `getById(host_id)` | `host-detail.ts`, `host-description.ts` | hot |
| `listActive()` returns `HostRecord[]` ordered by `last_seen` desc | `hosts.ts:121-126` | foundation for the dashboard list |
| `upsertIdentity(host_id, identityFields, now)` | `identity.ts` | merges identity + inventory |
| `touchHeartbeat(host_id, now)` | `heartbeat.ts`, `metrics.ts` | sets `last_seen` |
| `setDescription(host_id, value)` | `host-description.ts` | already wired |
| `retire(host_id)` / `unretire(host_id)` | admin paths | flips `is_active` |

### 2.2 Metrics (ephemeral, telemetry — TTL 7d)

| Op | Caller | Notes |
|---|---|---|
| `appendTick(host_id, payload)` returns `{persisted: bool}` | `ingest.ts` | applies §6 delta-suppression; updates last-ref + latest atomically (§8) |
| `getLatest(host_id)` returns `LatestMetrics \| null` | `hosts.ts:135-153` | served from a single key (§5.3) — no series scan |
| `readWindow(host_id, fromTs, toTs)` returns `Tick[]` | `metrics.ts:47-115`, host detail charts | reads ≤ N hour-buckets (§5.2) and slices |
| `readWindowExpanded(host_id, fromTs, toTs, stepSec)` returns `Tick[]` | UI helper / hourly cron | uses `expandSeries` (§6.2) |
| `readHourly(host_id, fromHour, toHour)` returns `HourlyRow[]` | `metrics.ts` | reads 1 day-bucket per 24h (§5.4) |
| `getActiveHostIdsInHour(hourTs)` returns `string[]` | cron aggregator | used by §7 |

### 2.3 Alerts (durable for active state, ephemeral history)

| Op | Caller | Notes |
|---|---|---|
| `getActive()`, `getActiveByHost(host_id)` | `hosts.ts:156-175`, `alerts.ts` | full active set is small |
| `setActive(host_id, rule_id, AlertState)` | alert evaluator | overwrite |
| `clearActive(host_id, rule_id)` | alert evaluator | delete |
| `getPending(...)` / `setPending(...)` / `clearPending(...)` | alert evaluator | symmetric |

### 2.4 Events (ephemeral — TTL 7d)

| Op | Caller | Notes |
|---|---|---|
| `append(host_id, EventRecord)` | `events-ingest.ts` | bucket-per-day write (§5.5) |
| `listForHost(host_id, fromTs, toTs)` | `events-list.ts` | bucket scan |
| `listFleet(fromTs, toTs, limit)` | dashboards | maintained "recent fleet events" rolling buffer key (§5.5) |

### 2.5 Webhooks / Allowed-ports / Tags / Settings / Maintenance (durable)

Standard CRUD with small cardinalities. Each repo exposes `list()`, `getById(id)`, `upsert(...)`, `delete(id)`. Tag edges (`host_tags`, `agent_tags`, `asset_tags`) are modeled as bidirectional indexes (§4.5) and exposed as `addEdge` / `removeEdge` / `byEntity(entity_id)` / `byTag(tag_id)`.

### 2.6 Agents / Assets / Bindings / CLI tokens (durable, with uniqueness)

| Op | Caller | Notes |
|---|---|---|
| `agents.upsertBy(source_key, match_key, fields)` | `services/agents.ts:188-202` | replaces `ON CONFLICT(source_key, match_key)`; uses uniqueness index (§4.5) |
| `agents.heartbeat(id, now)` | `agents.ts` | overwrite `last_heartbeat` |
| `agents.listWithHostJoin()` | `services/agents.ts:7-41` | repo-side join: read agents + tag edges + linked hosts in parallel |
| `assets.list/get/upsert/delete` | `assets.ts` | + secondary index by status/type (§4.5) |
| `bindings.upsert(agent_id, asset_id, fields)` | `bindings.ts` | both-direction index (`bind:` + `bindrev:`) |
| `bindings.byAgent(id)` / `byAsset(id)` | `bindings.ts` | uses the right index |
| `cli_tokens.create(token, ttl)` | `cli-auth.ts` | TTL = expiry |
| `cli_tokens.lookupByHash(hash)` | `cli-auth.ts` | direct key |

This list is the v2 contract. Repo files mirror it 1:1.

## 3. Architecture: domain-repo first, KV primitives second

```
routes/*  ──►  repos/*  ──►  adapters/*   ──►  bindings
   (HTTP)      (domain ops:    (D1 OR KV impl     (D1Database
               typed contracts  of one repo)       OR KVNamespace)
               in §2)
```

- **`repos/`** — typed contract per domain (one file per repo). Routes import only from `repos/`. Repos define the public interface (e.g. `HostsRepository`, `MetricsRepository`).
- **`adapters/d1/`** — `D1HostsRepository`, `D1MetricsRepository`, … each implementing the matching contract by talking to D1 (largely existing SQL, lifted out of `services/`).
- **`adapters/kv/`** — same set of classes implementing the same contracts via KV. **Inside** the KV adapter we use a small private helper:
  ```ts
  // adapters/kv/_kv-store.ts — adapter-internal, NOT exported as a public storage abstraction
  interface KeyValueStore { get<T>(k): Promise<T|null>; put<T>(k, v, opts?); delete(k); list(prefix, opts?); }
  ```
  This is implementation glue, not the cross-cutting business interface that v1 mistakenly elevated.
- **Wiring** — `index.ts` builds a `Repositories` bundle from the configured engine. Routes read `c.env.REPOS` (or `c.var.repos`); they never see `c.env.DB` or `c.env.BAT_KV` directly after the migration.

The repo contracts are the only thing the rest of the codebase depends on. D1 and KV are interchangeable behind them.

## 4. KV layout

KV has only **point keys** + **prefix list with `start`/`end` cursors**. We design every read pattern to fit in either "exact key get" or "small bounded prefix list".

### 4.1 Key prefix table

| Logical store | Key shape | Value | Lifecycle |
|---|---|---|---|
| Host record | `host:{host_id}` | `HostRecord` JSON | durable |
| Active hosts index | `idx:host:active:{host_id}` | `{ last_seen }` | durable; rewritten on heartbeat (replaces a sortable secondary key — see §4.5) |
| **Latest metric tick** | `m:latest:{host_id}` | `LatestMetrics` (small) | durable rewrite per persisted tick |
| **Last-persisted ref** (per-field, drives delta-suppression) | `m:last:{host_id}` | `LastRef` JSON | TTL = 7d + 1h slack (B7 — covers downtime gaps) |
| **Raw metric bucket** | `m:r:{host_id}:{hourBucket}` | `{ ticks: Tick[] }` (1 hour of persisted ticks) | TTL = 7d + 1h |
| Hourly bucket | `m:h:{host_id}:{dayBucket}` | `{ hours: HourlyRow[24] }` (1 day of hourly rows) | TTL = 7d + 1d |
| Tier-2 snapshot | `t2:{host_id}` | `Tier2Snapshot` JSON | durable |
| Alert state (active) | `alert:state:{host_id}:{rule_id}` | `AlertState` JSON | durable; deleted on clear |
| Alert pending | `alert:pending:{host_id}:{rule_id}` | `AlertPending` JSON | durable; deleted on clear |
| **Event bucket** | `evt:{host_id}:{dayBucket}` | `{ events: EventRecord[] }` | TTL = 7d + 1d |
| Fleet recent-events ring | `evt:fleet:recent` | rolling N events (capped, e.g. 500) | durable rewrite |
| Webhook config | `wh:{id}` | `WebhookConfig` | durable |
| Port allowlist entry | `port:{id}` | `PortAllowlist` | durable |
| Tag | `tag:{tag_id}` | `Tag` | durable |
| Tag edge (host) | `tagedge:host:{host_id}:{tag_id}` | `""` | durable |
| Tag edge (agent) | `tagedge:agent:{agent_id}:{tag_id}` | `""` | durable |
| Tag edge (asset) | `tagedge:asset:{asset_id}:{tag_id}` | `""` | durable |
| Tag reverse (by tag) | `tagrev:{tag_id}:{kind}:{entity_id}` | `""` | durable; written together with `tagedge:` |
| Setting | `set:{key}` | scalar/JSON | durable |
| Maintenance | `maint:{id}` | `MaintenanceWindow` | durable |
| Agent | `agent:{id}` | `Agent` | durable |
| Agent uniqueness | `agentkey:{source_key}:{match_key}` | `{ id }` | durable; used by upsertBy (§4.5) |
| Asset | `asset:{id}` | `Asset` | durable |
| Asset by status/type | `assetidx:{status}:{type}:{id}` | `""` | durable |
| Binding | `bind:{agent_id}:{asset_id}` | `Binding` | durable |
| Binding reverse | `bindrev:{asset_id}:{agent_id}` | `""` | durable; written/deleted with `bind:` |
| CLI token | `cli:tok:{hash}` | `CliToken` | TTL = token expiry |

`hourBucket` and `dayBucket` are zero-padded so `list({prefix, start, end})` returns chronological order. Conventions:

```
hourBucket = Math.floor(ts / 3600).toString().padStart(10, "0")
dayBucket  = Math.floor(ts / 86400).toString().padStart(7, "0")
```

### 4.2 Why bucket-per-hour for raw, bucket-per-day for hourly

Probe interval is 30 s; even with **no** suppression a host emits 120 ticks/h ≈ a few KB JSON per bucket. With suppression it's much smaller. A 24 h chart hits **24 buckets** and an HD detail page (1 h) hits **1 bucket**. A 7 d chart hits 168 buckets — still well under any list-pagination concern.

Hourly bucketed by day means a 7 d hourly query is **7 keys**.

### 4.3 Concurrent writers within one bucket

The single-host single-probe assumption holds today (probe is one process per host). Append within a bucket is **read-modify-write**:

```
b = get(m:r:{host}:{hourBucket}) ?? { ticks: [] }
if (!b.ticks.find(t => t.ts === payload.ts)) b.ticks.push(payload)
b.ticks.sort(by ts)
put(m:r:{host}:{hourBucket}, b, ttl)
```

Because (a) one writer per host, (b) `ts` is a natural idempotency key, and (c) we sort on every put, the operation is **idempotent under retries**. If a probe re-sends the same `ts`, the dedupe filter above suppresses it. The only failure mode is two concurrent writes from the same host within KV's edge propagation window — see §8 for mitigation (write-then-read-back verify is **not** required because retries are idempotent).

### 4.4 No journal or migration writes

We do **not** journal incoming raw payloads to a side store; the bucket *is* the durable record. `m:last` and `m:latest` are derived state — both can be rebuilt from a recent bucket scan on demand, so we never block ingest waiting for them.

### 4.5 Secondary indexes: lifecycle rules (B6)

Every secondary index lists explicit create/replace/delete rules. Repos own their indexes; routes never write index keys directly.

| Index | Create | Replace / update | Delete |
|---|---|---|---|
| `idx:host:active:{host_id}` (heartbeat-touched) | `hosts.upsertIdentity` | `hosts.touchHeartbeat` overwrites the value (last_seen) — same key, no churn | `hosts.retire` deletes |
| `agentkey:{source_key}:{match_key}` | `agents.upsertBy` first hit (uniqueness sentinel) | If a later upsertBy mutates source/match keys, **delete old sentinel + create new** in one repo call | `agents.delete` deletes both `agent:{id}` and any sentinel that points to it |
| `assetidx:{status}:{type}:{id}` | `assets.upsert` | If status or type changes: delete old idx key, write new one in the same repo call | `assets.delete` |
| `tagedge:` + `tagrev:` (paired) | `tags.addEdge(kind, entity_id, tag_id)` writes both | n/a (edges are unique) | `tags.removeEdge` deletes both |
| `bind:` + `bindrev:` (paired) | `bindings.upsert` writes both | If keys change: delete old pair, create new pair | `bindings.delete` deletes both |

Index keys never carry mutable data in their key path **except** when that mutation is the index's purpose (e.g. `assetidx` by status). For status changes we delete-then-write inside one repo method; this is non-atomic across KV but is a single-writer admin path with retries that converge.

Sortable by-recency lists (e.g. dashboard hosts) are **not** built on KV-ordered keys (which would churn one key per heartbeat). Instead we list the index keys, fetch values in parallel, and sort in memory. With ≤ a few hundred active hosts this is cheap; for higher cardinalities we add a paginated bucketed index.

## 5. Metrics in detail

### 5.1 Latest

Single key per host, overwritten on every persisted tick:

```
m:latest:{host_id} → LatestMetrics
```

`LatestMetrics` is a denormalized projection of the last persisted tick — `cpu_usage_pct`, `mem_used_pct`, `uptime_seconds`, `cpu_load1`, `swap_used_pct`, `disk_json`, `net_json`, plus `ts`. The dashboard list (`hosts.ts:135-153`) becomes one `getLatest` per host (parallelized by `Promise.all`), no series scan.

### 5.2 Raw bucket

```
m:r:{host_id}:{hourBucket} → { ticks: Tick[] }
```

`Tick` keeps only the fields we already persist after suppression. A 24 h read fetches 24 keys (or 25 with the boundary hour) and concatenates. A range read becomes a parallel `Promise.all` of `get(...)` plus an in-memory slice on `(fromTs, toTs)`.

### 5.3 Last-persisted ref

```
m:last:{host_id} → {
  ts: number,
  fields: { cpu_usage_pct, cpu_load1, cpu_load5, cpu_load15,
            mem_used_pct, swap_used_pct,
            disk: Record<mount, used_pct>,
            net: Record<iface, { rx_rate, tx_rate }> }
}
```

TTL = 7d + 1h. Rationale: if a host is offline ≥ 7d, its last-ref expires; the next sample is treated as the first sample (always recorded) — exactly the desired behaviour per §6.3.

### 5.4 Hourly day-bucket

```
m:h:{host_id}:{dayBucket} → { hours: { [hourTsString]: HourlyRow } }
```

Hourly cron writes one key per host per day (idempotent — overwrite). 7d = 7 keys per host. The `HourlyRow` schema mirrors today's `metrics_hourly` columns.

### 5.5 Events

```
evt:{host_id}:{dayBucket} → { events: EventRecord[] }   (TTL 7d+1d)
evt:fleet:recent          → { events: EventRecord[<=500] }   (durable, rolling)
```

Append uses the same read-modify-write pattern as raw buckets. `evt:fleet:recent` is the dashboard "recent events" feed; we maintain it as a capped ring on append.

## 6. Per-field comparator policy (delta-suppression)

### 6.1 Threshold rules per field family (B3)

| Field family | Comparator | Default threshold | Rationale |
|---|---|---|---|
| `*_pct` (cpu_usage_pct, mem_used_pct, swap_used_pct, mount.used_pct) | absolute percentage points | **1.0 pp** (config-able; floor 0.5 pp for fields where idle noise matters) | Matches the user's "12% → 13%" example; relative threshold under-suppresses near 0 and over-suppresses near 100 |
| `cpu_load*`, rates (`*_sec`, `*_bytes_rate`) | relative + absolute floor | 5% relative, 0.05 absolute floor | Loads are scale-free; relative makes sense |
| Bytes / sizes (`mem_total`, `disk total/avail`) | relative | 1% | Slow-moving levels |
| Counters / deltas (`*_delta`, `oom_kills`, retransmits) | always-write | n/a | Lossy aggregation if dropped |
| Inventory-shaped (cpu_count, mem_total, hostname, etc.) | always-write | n/a | Rare, important changes |

`shouldRecord(prev, next, kind)` is implemented as a **dispatch table** keyed by field; per-field overrides are configurable (settings store) but we do **not** plumb that through in v2's first commits — defaults only.

### 6.2 Read-side expansion

`expandSeries(rows, fromTs, toTs, stepSec)` is a **pure** helper in `@bat/shared` that:

1. Returns rows verbatim when `stepSec` is `null` (the API default).
2. When `stepSec` is set, walks `[fromTs, toTs]` and emits the most recent prior `Tick` at each step, otherwise interpolates by **forward-fill** (no linear interpolation — a sample being absent means "unchanged").

This is what powers `readWindowExpanded` and the time-weighted aggregator.

### 6.3 Boundary semantics

- First sample after probe restart (`boot_time` change OR `m:last` absent) is always recorded.
- Heartbeat anchor: if `now - m:last.ts >= 3600`, the sample is always recorded. This guarantees the hourly aggregator has at least one anchor per hour even on a perfectly flat host.
- On host retire (`is_active=0`), suppress all writes — keeps a retired host from drifting.

## 7. Hourly aggregation (B4)

Aggregation runs on **time-weighted** values, not raw row arithmetic.

```
expandSeries(rows, hourTs, hourTs+3600, 1)            // 3600 second-by-second levels (cheap; values are forward-filled)
=> per-second array
=> compute avg / max / min / p95 over the array      // unbiased on sparse data
```

`sample_count` semantics in v2: **persisted samples in the hour** (i.e. how many ticks survived suppression). We add a separate `expanded_seconds` field for transparency. UI label remains "samples" pointing at `sample_count`.

If a probe was offline part of the hour (`expandSeries` would forward-fill from the prior hour), aggregator detects "no prior anchor within 1 h" and reports nulls for that hour rather than synthesizing data — matches today's "no metrics" hourly behaviour.

## 8. Concurrency & consistency (B7)

KV is eventually consistent; all writes are last-write-wins per key.

| Operation | Concurrency profile | Strategy |
|---|---|---|
| `metrics.appendTick` (raw bucket + last + latest) | Single writer (probe) per host | RMW with idempotent dedupe by `ts` (§4.3); ordering across the 3 writes is "bucket → last → latest" with each step independently safe under retries |
| `hosts.upsertIdentity` / `touchHeartbeat` | Probe + admin can race in theory | Heartbeat overwrites `last_seen`; admin identity merges into the same record — both are last-write-wins on `host:{id}` and the index points to the same record |
| `agents.upsertBy(source_key, match_key)` | Concurrent ingest from multiple agents possible | (a) `get(agentkey:{source}:{match})`; (b) if exists, `put(agent:{id})` (merge); (c) else generate id, write `agentkey:` and `agent:{id}`. Race between two creates can result in two `agent:{id}` records — mitigated by writing `agentkey:` first as a sentinel and re-reading it after; if it now points to a different id, abandon ours and merge into the winner. Idempotent on retry. |
| Alerts state set/clear | Single-writer (cron alert evaluator) | No race expected; treat as last-write-wins |
| Tag edge add/remove (paired) | Admin path | Best-effort; if one half fails, repo logs and a periodic reconciliation (post-migration follow-up) cleans orphans |
| Cli tokens create | Single create per token | TTL on key, no race |

We accept a small probability of orphan reverse-index keys after partial failures; a `repos.reconcile()` background task is post-migration cleanup work, tracked in `docs/20-d1-to-kv-migration.md` follow-ups.

## 9. Test strategy (G5)

1. **Repo contract suite** under `packages/worker/test/repos/*.contract.test.ts`. Each repo has one suite, instantiated twice — once with `D1*Repository`, once with `KV*Repository`. Same assertions, two engines. Until C7, both adapters must pass.
2. **KV adapter unit tests** use **Miniflare**'s `KVNamespace` shim. We test bucket boundary behaviour, TTL on writes (Miniflare exposes the configured TTL), index lifecycle, and the agents `upsertBy` race.
3. **D1 adapter unit tests** are largely the existing `services/*.test.ts` suite, ported under `adapters/d1/*.test.ts`.
4. **Pure-function coverage**: `expandSeries`, `shouldRecord`, `computeHourly` all live in `@bat/shared` with full table-driven unit tests.
5. **Route tests** (`packages/worker/src/routes/*.test.ts`) keep passing unchanged: they use a mock `Repositories` bundle, so they don't care about engines.
6. **E2E** (`test/e2e/*`) — unchanged surface. Adds: `expandSeries` correctness path, time-weighted hourly correctness, agents upsertBy parallel race, retired-host suppression, post-7d expiry lookup returns 404.

Coverage gate: 95% TS (including new `repos/` and `adapters/`), 95% Rust (probe), enforced by existing `scripts/check-coverage.sh`.

## 10. Phasing & atomic commits

Each commit ships green: `lint` + `typecheck` + `test` + `gate:routes` + `gate:pages` + `gate:security`.

| # | Commit | Surface | Risk |
|---|---|---|---|
| C1 | `repos/` interfaces and a thin `Repositories` bundle wired into `c.var.repos` (no engine yet — `Repositories` defaulting to D1 stubs that delegate to existing services) | type contracts + wiring | none |
| C2 | Move route handlers off `c.env.DB` and onto `c.var.repos` + add a `D1*Repository` per domain (hosts, alerts, events, webhook, ports, tags, settings, maintenance, agents, assets, bindings, tokens, tier2). `services/*` delete in a follow-up | per-route | low — same engine, new entry |
| C3 | `MetricsRepository` D1 impl + `expandSeries` + `shouldRecord` + `computeHourly` pure helpers in `@bat/shared` (table-driven tests). No behavioural change yet — D1 still stores every tick. | pure code + repo | low |
| C4 | `KV*Repository` set + Miniflare contract tests; **not wired** in production binding yet | new files | low |
| C5 | Cron path: KV-native `aggregateHour` using time-weighted aggregator; D1 path stays as fallback for the repo's hourly read | cron | medium |
| C6 | Add KV binding `BAT_KV` to dev `wrangler.toml`; default `c.var.repos` to KV in dev only; CI gates run against KV | config | medium |
| C7 | Production cutover: add `BAT_KV` to `[env.production]`, switch `Repositories` factory to KV. **Keep** D1 binding for one release as read-only rollback (B7 reviewer ask). | config | high — gated by user sign-off |
| C8 | Soak window over: drop D1 binding, delete D1 adapters and `services/*`, remove unused migrations from worker source tree (history kept) | cleanup | low (post-soak) |

## 11. Open questions for @zheng-li

1. **Datasets that should be 7-day TTL vs durable** (B5):
   - Ephemeral (proposed TTL 7d): raw metrics, hourly metrics, events, last-ref, latest projection.
   - Durable (proposed no TTL): hosts, alert states, webhook configs, port allowlist, tags, settings, maintenance, agents, assets, bindings, tier2 snapshots, CLI tokens (own expiry).
   Confirm — or tell me which durable items should also expire.
2. **C7 cutover** — one-shot is fine (no D1 → KV backfill, per G3), but plan keeps the D1 binding bound at C7 for **one release** as read-only rollback. C8 drops it after soak. OK?
3. **`BAT_KV` binding name** in `wrangler.toml` (dev + prod) — confirm or override.
4. **Per-field default thresholds** (§6.1) — confirm 1.0 pp absolute for `*_pct`, 5% relative + 0.05 floor for loads/rates, always-write for counters. Tunable via settings later, defaults for now.

## 12. Non-goals

- No D1 backfill (G3).
- No DOs / R2 / Queues — KV alone.
- No UI API contract changes; charts stay backward-compatible after `expandSeries` lands client-side.
- No production cutover before reviewer + user sign-off on this v2.
