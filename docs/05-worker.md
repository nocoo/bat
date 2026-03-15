# 05 — CF Worker

> Cloudflare Worker (Hono). Receives metrics from Probe, stores in D1, evaluates alerts, serves health endpoint for Uptime Kuma, and provides authenticated read API for Dashboard.
>
> Related documents:
> - [02-architecture.md](./02-architecture.md) — System overview, auth model, deployment
> - [03-data-structures.md](./03-data-structures.md) — D1 schema, payload types, alert rules, time source policy
> - [04-probe.md](./04-probe.md) — Probe that sends data to this Worker
> - [06-dashboard.md](./06-dashboard.md) — Dashboard that reads from this Worker via proxy

---

## Route Table

| Route | Auth | Method | Purpose |
|-------|------|--------|---------|
| `/api/ingest` | Write Key | POST | Receive Tier-1 metrics, evaluate alerts |
| `/api/identity` | Write Key | POST | Receive/update host identity |
| `/api/hosts` | Read Key | GET | List active hosts with latest status (`is_active = 1`) |
| `/api/hosts/:id/metrics` | Read Key | GET | Query metrics (`?from=&to=`, auto raw/hourly) |
| `/api/alerts` | Read Key | GET | List all active alerts across all hosts |
| `/api/health` | Public | GET | Overall health (200/degraded/503) for Uptime Kuma |

---

## Middleware

### API Key Auth (`middleware/api-key.ts`)

One middleware handles both keys, scoped by route:

- **Write routes** (`POST /api/ingest`, `POST /api/identity`): validate against `BAT_WRITE_KEY`
- **Read routes** (`GET /api/hosts`, `GET /api/hosts/:id/metrics`, `GET /api/alerts`): validate against `BAT_READ_KEY`
- **Public routes** (`GET /api/health`): no auth required

**Rejection semantics**:
- Missing `Authorization` header → `401 Unauthorized`
- Wrong key (e.g. read key on write route, or invalid key) → `403 Forbidden`

This ensures key scope isolation: even if `BAT_READ_KEY` leaks, the attacker cannot forge metrics or manipulate alerts.

---

## Write Routes

### POST /api/ingest (`routes/ingest.ts`)

Receives Tier-1 metrics payload from Probe. Single Worker invocation, D1 batch for atomicity.

**Critical path**:

1. Validate payload shape (lightweight check, no Zod — verify required fields exist and are correct types)
2. **Clock skew guard**: Reject if `abs(payload.timestamp - Date.now() / 1000) > 300` (5 min). Return `400` with error message suggesting NTP sync. See [03-data-structures.md § Time source policy](./03-data-structures.md).
3. **Check retirement**: If `host_id` exists in `hosts` with `is_active = 0`, return `403` with error message `"host is retired"`. This prevents silent dirty data from stale Probes. The operator must either stop the Probe or reactivate the host before metrics are accepted.
4. `INSERT INTO metrics_raw` — flatten scalars, `JSON.stringify()` disk/net arrays. Column mapping in [03-data-structures.md § D1 column mapping](./03-data-structures.md).
5. `INSERT INTO hosts (host_id, hostname, last_seen, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(host_id) DO UPDATE SET last_seen = ?` — ensures host row exists even if identity was never received or failed. Uses `host_id` as fallback hostname. Does NOT set `is_active` — only new hosts get the default `is_active = 1` from the DDL. `last_seen` = `Date.now()` (Worker time, not Probe time).
6. `evaluateAlerts(payload)` → UPSERT `alert_states` / `alert_pending`. See [Alert evaluation](#alert-evaluation).
7. Return `204 No Content`

**Why UPSERT instead of UPDATE**: The Probe sends identity on startup before any ingest, but identity can fail (network error, Worker cold start). If ingest required a pre-existing host row (via foreign key + UPDATE-only), the first metrics would be silently dropped. The UPSERT guarantees ingest is self-sufficient — it never fails because of a missing host row. When identity eventually succeeds, it fills in the full host metadata (os, kernel, arch, etc.).

### POST /api/identity (`routes/identity.ts`)

Receives host identity payload from Probe. Performs a **full overwrite** of all identity fields.

**Critical path**:

1. Validate payload shape
2. **Check retirement**: If `host_id` exists in `hosts` with `is_active = 0`, return `403` (same as ingest — retired hosts cannot write any data).
3. UPSERT host record:

```sql
INSERT INTO hosts (host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(host_id) DO UPDATE SET
  hostname = excluded.hostname,
  os = excluded.os,
  kernel = excluded.kernel,
  arch = excluded.arch,
  cpu_model = excluded.cpu_model,
  boot_time = excluded.boot_time,
  last_seen = excluded.last_seen,
  identity_updated_at = excluded.identity_updated_at;
  -- NOTE: is_active is NOT touched — retirement is an explicit human decision.
```

4. Return `204 No Content`

**Design choices**:
- **Full overwrite**: Every field is replaced on each identity POST. The Probe always sends a complete identity payload, so partial updates add complexity without benefit.
- **No auto-reactivation**: Identity updates do NOT change `is_active`. See [03-data-structures.md § Host lifecycle](./03-data-structures.md).
- **Detecting changes**: Compare `boot_time` to detect reboots. Compare `kernel`/`os` to detect upgrades. `identity_updated_at` tracks when metadata was last refreshed.

---

## Alert Evaluation

### evaluateAlerts(payload) (`services/alerts.ts`)

Called during ingest for every valid payload. Evaluates the 6 Tier-1 alert rules defined in [03-data-structures.md § Alert rules](./03-data-structures.md).

**Instant rules** (mem_high, no_swap, disk_full):

```
if condition met:
  UPSERT alert_states (host_id, rule_id) with current value + Worker timestamp
else:
  DELETE FROM alert_states WHERE host_id = ? AND rule_id = ?
```

**Duration rules** (iowait_high, steal_high):

```
if condition met:
  UPSERT alert_pending (host_id, rule_id, first_seen = Date.now(), last_value)
  if Date.now() - alert_pending.first_seen >= 300 (5 min):
    UPSERT alert_states (host_id, rule_id) — promote
else:
  DELETE FROM alert_pending WHERE host_id = ? AND rule_id = ?
  DELETE FROM alert_states WHERE host_id = ? AND rule_id = ?
```

**host_offline**: NOT evaluated during ingest — evaluated at health endpoint query time by comparing `hosts.last_seen` against `Date.now()`. See [Health endpoint](#health-endpoint).

---

## Read Routes

### GET /api/hosts (`routes/hosts.ts`)

Returns all active hosts (`is_active = 1`) with latest status info.

```sql
SELECT host_id, hostname, os, kernel, arch, cpu_model, boot_time,
       last_seen, identity_updated_at, created_at
FROM hosts
WHERE is_active = 1
ORDER BY hostname
```

### GET /api/hosts/:id/metrics (`routes/hosts.ts`)

Query parameters: `?from=<unix>&to=<unix>`

**Auto-resolution**: If `to - from > 24h`, query `metrics_hourly`. Otherwise, query `metrics_raw`. The caller (Dashboard) does not need to specify resolution — the Worker decides based on time range.

```sql
-- Raw (≤ 24h range)
SELECT * FROM metrics_raw
WHERE host_id = ? AND ts BETWEEN ? AND ?
ORDER BY ts

-- Hourly (> 24h range)
SELECT * FROM metrics_hourly
WHERE host_id = ? AND hour_ts BETWEEN ? AND ?
ORDER BY hour_ts
```

### GET /api/alerts (`routes/alerts.ts`)

Returns all active alerts across all active hosts.

```sql
SELECT a.*, h.hostname
FROM alert_states a
JOIN hosts h ON a.host_id = h.host_id
WHERE h.is_active = 1
ORDER BY a.triggered_at DESC
```

---

## Health Endpoint

### GET /api/health (`routes/health.ts`)

Public endpoint (no auth). Returns aggregate health status for Uptime Kuma.

**Response body**:

```json
{
  "status": "degraded",
  "total_hosts": 6,
  "healthy": 4,
  "warning": 1,
  "critical": 1,
  "checked_at": 1742025600
}
```

The health endpoint returns only aggregate counts — no host IDs, no alert details, no internal state. Detailed per-host status is only available via the authenticated `GET /api/hosts` and `GET /api/alerts` routes (through the Dashboard proxy).

**Evaluation steps**:

1. Query active hosts: `SELECT host_id, last_seen FROM hosts WHERE is_active = 1`
2. For each host, check `host_offline`: if `Date.now() / 1000 - last_seen > 120`, inject a virtual `host_offline` critical alert
3. Query `alert_states` for all active hosts
4. Count per-host worst severity: critical > warning > healthy
5. Derive overall status

**HTTP status code logic** (three-level):
- `200` — all hosts healthy, OR only `warning` alerts active → `"status": "healthy"` or `"degraded"`
- `503` — any `critical` alert active → `"status": "critical"`

This prevents warning-level alerts (iowait > 20%, steal > 10%) from triggering Uptime Kuma's downtime notification. Only critical conditions (mem > 85% + swap > 50%, no swap + mem > 70%, disk > 85%, host offline) produce a 503.

**Overall status derivation**: `critical` if any active host critical → `degraded` if any active host warning → `healthy` otherwise.

**Edge case — zero active hosts**: Returns `503` with `"status": "empty"` and `total_hosts: 0`. This is treated as critical — "no probes connected" is an operational problem, not a healthy state. Uptime Kuma's standard HTTP status code check (503 = down) handles this automatically with no body-parsing configuration.

---

## Hourly Aggregation Cron

### Cron Trigger: `0 * * * *`

Defined in `index.ts` scheduled handler.

**Steps**:

1. Determine previous complete hour: `floor(Date.now() / 3600000) * 3600 - 3600` (e.g. at 14:00, aggregate 13:00–13:59)
2. For each active host, aggregate `metrics_raw` rows in that hour window:
   - `cpu_usage_avg`, `cpu_usage_max`, `cpu_iowait_avg`, `cpu_steal_avg`
   - `cpu_load1_avg`, `cpu_load5_avg`, `cpu_load15_avg`
   - `mem_total` (last sample), `mem_available_min`, `mem_used_pct_avg`, `mem_used_pct_max`
   - `swap_total` (last sample), `swap_used_max`, `swap_used_pct_avg`, `swap_used_pct_max`
   - `uptime_min`
   - `disk_json`, `net_json` (last sample)
   - `sample_count`
3. Write: `INSERT INTO metrics_hourly ... ON CONFLICT(host_id, hour_ts) DO UPDATE SET ...`
4. Purge old data:
   - `DELETE FROM metrics_raw WHERE ts < Date.now() / 1000 - 7 * 86400`
   - `DELETE FROM metrics_hourly WHERE hour_ts < Date.now() / 1000 - 90 * 86400`

---

## Testing Strategy (this module)

### L1 — Unit Tests (`bun test`)

| Test file | What |
|-----------|------|
| `middleware/api-key.test.ts` | Accept valid write key on POST, valid read key on GET. Reject invalid key (401), cross-scope key (403), missing header (401) |
| `services/alerts.test.ts` | All 6 alert rules with mock payloads. Instant rules: fire and clear. Duration rules: track in pending, promote after 5 min, clear both tables. Edge cases: exactly-at-threshold, just-below-threshold |
| `services/aggregation.test.ts` | Aggregation SQL correctness: avg/max/min computation, sample_count, purge thresholds |
| `services/metrics.test.ts` | Auto-resolution logic: raw for ≤ 24h, hourly for > 24h. Column flattening. JSON stringify for disk/net |
| `routes/ingest.test.ts` | Valid payload → 204. Invalid payload → 400. Clock skew → 400. Retired host → 403. Missing key → 401. Read key → 403 |
| `routes/identity.test.ts` | Valid identity → 204, host created. Update existing → fields overwritten. Retired host → 403 |
| `routes/hosts.test.ts` | List returns only active hosts. Metrics query returns correct resolution |
| `routes/health.test.ts` | All healthy → 200. Warning only → 200 degraded. Critical → 503. Offline detection → 503. Zero hosts → 503 empty |
| `routes/alerts.test.ts` | Returns active alerts. Filters out retired hosts |

**Coverage target**: ≥ 90% on all services and middleware.

### L2 — Lint

- Biome strict mode, zero errors + zero warnings
- Typecheck: `tsc --noEmit`

### L3 — API E2E (`bun test` + local Wrangler)

Test every Worker route against local Wrangler dev server:

| Test | Route | Validates |
|------|-------|-----------|
| Ingest valid payload | `POST /api/ingest` | 204, data in D1 |
| Ingest missing API key | `POST /api/ingest` | 401 |
| Ingest invalid payload | `POST /api/ingest` | 400 |
| Ingest retired host | `POST /api/ingest` | 403, host is retired |
| Send identity | `POST /api/identity` | 204, host in D1 |
| List hosts | `GET /api/hosts` | Returns registered hosts |
| Query raw metrics | `GET /api/hosts/:id/metrics?from=&to=` | Correct count, raw resolution |
| Query hourly metrics | `GET /api/hosts/:id/metrics?from=&to=` | Hourly resolution for > 24h range |
| Health all healthy | `GET /api/health` | 200, all hosts healthy |
| Health with warning only | `GET /api/health` | 200, status "degraded", no 503 |
| Health with critical | `GET /api/health` | 503, critical alert details |
| Offline detection | `GET /api/health` | Host with old `last_seen` → offline (503) |
| Zero hosts health | `GET /api/health` | 503, status "empty", total_hosts: 0 |
| List all alerts | `GET /api/alerts` | Returns active alerts across hosts |
| Aggregation cron | `__scheduled` trigger | `metrics_hourly` populated, raw purged |
| Unauthenticated API | `GET /api/hosts` (no key) | 401 |
| Write key on read route | `GET /api/hosts` (write key) | 403, scope mismatch |
| Read key on write route | `POST /api/ingest` (read key) | 403, scope mismatch |

**Server convention**: Worker dev on port 8787, API E2E on port 18787.

### L4

Not applicable — Worker has no UI. API coverage is handled by L3.

---

## Atomic Commits (this module)

| # | Commit | Files | Verify |
|---|--------|-------|--------|
| 2.1 | `feat: add d1 schema and migration infrastructure` | `packages/worker/migrations/0001_initial.sql` | `wrangler d1 execute --local --file=migrations/0001_initial.sql` |
| 2.2 | `feat: add api key auth middleware with read/write scopes` | `middleware/api-key.ts` | UT: write key on POST routes, read key on GET routes, reject cross-scope usage |
| 2.3 | `feat: add identity route` | `routes/identity.ts`, `services/metrics.ts` | UT + manual curl |
| 2.4 | `feat: add ingest route` | `routes/ingest.ts` | UT + manual curl → 204 |
| 2.5 | `feat: add alert evaluation service` | `services/alerts.ts` | UT: all 6 rules, instant + duration |
| 2.6 | `feat: wire alert evaluation into ingest` | `routes/ingest.ts` | UT: ingest triggers alert state changes |
| 2.7 | `feat: add hosts list route` | `routes/hosts.ts` | UT: returns registered hosts |
| 2.8 | `feat: add metrics query route with auto resolution` | `routes/hosts.ts` | UT: raw vs hourly selection |
| 2.9 | `feat: add health endpoint with warning/critical distinction` | `routes/health.ts` | UT: 200 (healthy/warning-only), 503 (critical), offline detection |
| 2.10 | `feat: add alerts list route` | `routes/alerts.ts` | UT: returns all active alerts across hosts |
| 2.11 | `feat: add hourly aggregation cron` | `services/aggregation.ts`, `index.ts` scheduled handler | UT: aggregate + purge logic |
| 2.12 | `test: add api e2e tests for all worker routes` | `packages/worker/test/e2e/**` | All routes pass against local Wrangler |
