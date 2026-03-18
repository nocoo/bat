# 03 — Data Structures

> D1 schema, migration strategy, communication payload types, and alert rule definitions.
> All data structures referenced by [04-probe.md](./04-probe.md), [05-worker.md](./05-worker.md), and [06-dashboard.md](./06-dashboard.md) are defined here as the single source of truth.
>
> Related documents:
> - [01-metrics-catalogue.md](./01-metrics-catalogue.md) — What the Probe collects (metrics definitions, Tier 1 + Tier 2 catalogue)
> - [02-architecture.md](./02-architecture.md) — System overview, deployment
> - [05-worker.md](./05-worker.md) — How Worker uses these structures (ingest, queries, alerts)

---

## D1 Schema

### hosts

Host identity and lifecycle state. Written by Worker on ingest (UPSERT `last_seen`) and identity (full overwrite of metadata fields).

```sql
CREATE TABLE hosts (
  host_id    TEXT PRIMARY KEY,
  hostname   TEXT NOT NULL,
  os         TEXT,
  kernel     TEXT,
  arch       TEXT,
  cpu_model  TEXT,
  boot_time  INTEGER,
  last_seen  INTEGER NOT NULL,
  identity_updated_at INTEGER,       -- last time identity payload was received
  is_active  INTEGER NOT NULL DEFAULT 1, -- 0 = retired/disabled, excluded from health + lists
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

**Key semantics**:
- `host_id` is immutable — it's the primary key. If a machine's `host_id` changes (new config), it appears as a new host.
- `last_seen` uses **Worker time** (`Date.now()` at request time), NOT Probe time. See [Time source policy](#time-source-policy).
- `is_active` controls visibility. See [Host lifecycle and retirement](#host-lifecycle-and-retirement).

### metrics_raw

Raw metrics with 7-day retention. One row per Probe report.

```sql
CREATE TABLE metrics_raw (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  host_id         TEXT    NOT NULL,
  ts              INTEGER NOT NULL,
  cpu_load1       REAL,
  cpu_load5       REAL,
  cpu_load15      REAL,
  cpu_usage_pct   REAL,
  cpu_iowait      REAL,
  cpu_steal       REAL,
  cpu_count       INTEGER,
  mem_total       INTEGER,
  mem_available   INTEGER,
  mem_used_pct    REAL,
  swap_total      INTEGER,
  swap_used       INTEGER,
  swap_used_pct   REAL,
  disk_json       TEXT,
  net_json        TEXT,
  uptime_seconds  INTEGER,
  FOREIGN KEY (host_id) REFERENCES hosts(host_id)
);
CREATE INDEX idx_raw_host_ts ON metrics_raw(host_id, ts);
```

- `ts` uses **Probe time** (payload `timestamp`). See [Time source policy](#time-source-policy).
- `disk_json` / `net_json` are JSON text — Dashboard always fetches the full array, D1 `json_extract()` handles rare per-mount queries.

### metrics_hourly

Aggregated metrics with 90-day retention. Composite primary key, no autoincrement id.

```sql
CREATE TABLE metrics_hourly (
  host_id          TEXT    NOT NULL,
  hour_ts          INTEGER NOT NULL,
  sample_count     INTEGER NOT NULL,
  cpu_usage_avg    REAL,
  cpu_usage_max    REAL,
  cpu_iowait_avg   REAL,
  cpu_steal_avg    REAL,
  cpu_load1_avg    REAL,
  cpu_load5_avg    REAL,
  cpu_load15_avg   REAL,
  mem_total        INTEGER,          -- last sample (static per host, but needed for display)
  mem_available_min INTEGER,         -- min available in the hour (worst case)
  mem_used_pct_avg REAL,
  mem_used_pct_max REAL,
  swap_total       INTEGER,          -- last sample (needed for no_swap alert on hourly data)
  swap_used_max    INTEGER,          -- max swap used in the hour
  swap_used_pct_avg REAL,
  swap_used_pct_max REAL,            -- needed for mem_high alert (swap > 50%)
  uptime_min       INTEGER,
  disk_json        TEXT,             -- last sample (disk is capacity, not rate — last sample is representative)
  net_rx_bytes_avg REAL,             -- avg rx bytes/sec across all interfaces in the hour
  net_rx_bytes_max REAL,             -- max rx bytes/sec peak in the hour
  net_tx_bytes_avg REAL,             -- avg tx bytes/sec
  net_tx_bytes_max REAL,             -- max tx bytes/sec peak
  net_rx_errors    INTEGER,          -- sum of per-interval deltas in the hour
  net_tx_errors    INTEGER,          -- sum of per-interval deltas in the hour
  -- Tier 3: PSI pressure (avg + max for alert-relevant avg60 fields)
  psi_cpu_some_avg10_avg  REAL,
  psi_cpu_some_avg10_max  REAL,
  psi_cpu_some_avg60_avg  REAL,
  psi_cpu_some_avg60_max  REAL,      -- alert #16 threshold check
  psi_mem_some_avg60_avg  REAL,
  psi_mem_some_avg60_max  REAL,      -- alert #17 threshold check
  psi_mem_full_avg60_avg  REAL,
  psi_mem_full_avg60_max  REAL,
  psi_io_some_avg60_avg   REAL,
  psi_io_some_avg60_max   REAL,      -- alert #18 threshold check
  psi_io_full_avg60_avg   REAL,
  psi_io_full_avg60_max   REAL,
  -- Tier 3: Disk I/O (JSON per-device averages)
  disk_io_json     TEXT,             -- [{device, read_iops_avg, write_iops_avg, ..., io_util_pct_avg, io_util_pct_max}]
  -- Tier 3: TCP connection state
  tcp_established_avg  REAL,
  tcp_established_max  INTEGER,
  tcp_time_wait_avg    REAL,
  tcp_time_wait_max    INTEGER,      -- alert #20 threshold check
  tcp_orphan_avg       REAL,
  tcp_orphan_max       INTEGER,
  tcp_allocated_avg    REAL,
  tcp_allocated_max    INTEGER,
  -- Tier 3: CPU extensions
  context_switches_sec_avg REAL,
  context_switches_sec_max REAL,
  forks_sec_avg        REAL,
  forks_sec_max        REAL,
  procs_running_avg    REAL,
  procs_running_max    INTEGER,
  procs_blocked_avg    REAL,
  procs_blocked_max    INTEGER,
  -- Tier 3: OOM kills (sum of deltas in the hour)
  oom_kills_sum        INTEGER,      -- alert #21 check
  -- Tier 3: File descriptors
  fd_allocated_avg     REAL,
  fd_allocated_max     INTEGER,
  fd_max               INTEGER,      -- last sample (static)
  PRIMARY KEY (host_id, hour_ts),
  FOREIGN KEY (host_id) REFERENCES hosts(host_id)
);
-- No separate index needed — PRIMARY KEY (host_id, hour_ts) is already indexed
```

**Design rationale for hourly network fields**:
- `net_json` (last sample) was misleading for long-range charts — it represents one instant, not the hour's traffic pattern
- Scalar avg/max fields give Dashboard meaningful data for 7d/30d/90d network charts
- Per-interface breakdown is lost in hourly aggregation — this is acceptable for MVP (6 hosts, typically 1 primary interface). Post-MVP can add per-interface hourly if needed
- `disk_json` remains as last sample because disk usage is capacity (slow-changing), not a rate — last sample is representative of the hour

**Write semantics**: Use `INSERT INTO metrics_hourly ... ON CONFLICT(host_id, hour_ts) DO UPDATE SET ...` — NOT `INSERT OR REPLACE`, which is delete+insert in SQLite and would break triggers/FK cascades/audit fields.

### alert_states

Active alerts. One row per (host, rule) pair. UPSERT on each ingest evaluation.

```sql
CREATE TABLE alert_states (
  host_id      TEXT NOT NULL,
  rule_id      TEXT NOT NULL,
  severity     TEXT NOT NULL CHECK(severity IN ('warning', 'critical')),
  value        REAL,
  triggered_at INTEGER NOT NULL,
  message      TEXT,
  PRIMARY KEY (host_id, rule_id),
  FOREIGN KEY (host_id) REFERENCES hosts(host_id)
);
```

### alert_pending

Duration-based alert staging. Tracks how long a condition has been sustained before promoting to `alert_states`.

```sql
CREATE TABLE alert_pending (
  host_id    TEXT NOT NULL,
  rule_id    TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_value REAL,
  PRIMARY KEY (host_id, rule_id)
);
```

### _migrations

Schema version tracking. See [D1 Migration Strategy](#d1-migration-strategy).

```sql
CREATE TABLE IF NOT EXISTS _migrations (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL UNIQUE,
  applied INTEGER NOT NULL DEFAULT (unixepoch())
);
```

---

## D1 Migration Strategy

D1 has no built-in migration tool. We use a **numbered SQL files** convention with **manual execution**:

```
packages/worker/migrations/
├── 0001_initial.sql        # Initial schema (all CREATE TABLE/INDEX statements + _migrations)
├── 0002_add_foo_column.sql # Future: ALTER TABLE ... ADD COLUMN
└── ...
```

**Rules**:
- Each migration file is **idempotent** where possible (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). `ALTER TABLE ADD COLUMN` is not idempotent in SQLite — guard with a comment noting manual check.
- Files are applied in numeric order. The `_migrations` meta-table tracks which have been applied (for human reference, not auto-executed).
- **Execution**: All migrations are applied manually via `wrangler d1 execute bat-db --file=migrations/NNNN_*.sql` during deploy. There is no auto-runner — the operator checks `_migrations` and runs unapplied files in order. This is sufficient for a 6-host system with infrequent schema changes.
- **MVP**: `0001_initial.sql` contains the full DDL (including `_migrations` table). Subsequent schema changes go into `0002_`, `0003_`, etc.
- **No down migrations**: D1 has no transactional DDL. If a migration is wrong, write a corrective forward migration.

---

## Time Source Policy

Two separate time sources, each authoritative for its purpose:

| Field | Source | Why |
|-------|--------|-----|
| `metrics_raw.ts` | **Probe** (payload `timestamp`) | Chart X-axis must reflect when metrics were *measured*, not when they arrived. Network latency or retry delay should not shift data points. |
| `hosts.last_seen` | **Worker** (`Date.now()` at request time) | Offline detection compares `last_seen` against server-side `now`. If `last_seen` used Probe time, NTP drift on a VPS could mask or fabricate offline alerts. |
| `hosts.identity_updated_at` | **Worker** (`Date.now()`) | Same rationale as `last_seen`. |
| `alert_states.triggered_at` | **Worker** (`Date.now()`) | Alert timing must be consistent with offline evaluation. |

**Implication for ingest**: The UPSERT writes `last_seen = Date.now()` (server time), NOT the Probe's `payload.timestamp`. The payload timestamp is only written to `metrics_raw.ts`.

**Clock skew guard**: Worker rejects payloads where `abs(payload.timestamp - Date.now()) > 300` (5 min skew). This catches severely misconfigured NTP without breaking normal operation. Returns `400` with error message suggesting NTP sync. Probe treats `400` as a permanent error and does not retry (same as `401`). See [04-probe.md § Main loop](./04-probe.md).

---

## Host Lifecycle and Retirement

Hosts are never auto-deleted. Instead:

- **`is_active = 1`** (default): Host appears in `/api/hosts`, `/api/health`, `/api/alerts`
- **`is_active = 0`** (retired): Host is excluded from all API responses and health checks. Metrics data follows normal retention (7d raw, 90d hourly) and ages out naturally. Ingest and identity requests for retired hosts are **rejected with `403`** — no silent dirty data from stale Probes.

**How to retire a host (MVP)**: Direct D1 console command — `wrangler d1 execute bat-db --command "UPDATE hosts SET is_active = 0 WHERE host_id = 'xxx'"`. No API route for retirement in MVP. Post-MVP: add `PATCH /api/hosts/:id` route (Write Key auth) and a "retire" button in the Dashboard UI.

**How to reactivate**: Same mechanism — `wrangler d1 execute bat-db --command "UPDATE hosts SET is_active = 1 WHERE host_id = 'xxx'"`.

**Why not auto-retire**: Auto-retiring after N days of `last_seen` would mask real outages. A host that's been offline for 2 weeks might be a forgotten VM that still costs money — the persistent offline alert is intentional. Retirement is an explicit human decision.

**Health endpoint behavior with retired hosts**: `GET /api/health` only counts active hosts. A fleet of 6 active + 2 retired shows `total_hosts: 6`.

**Identity does NOT auto-reactivate**: `POST /api/identity` does NOT change `is_active`. If a host was manually retired, receiving new identity payloads (e.g. from a stale Probe or redeployment) does not silently bring it back. This is consistent with the principle that retirement is an explicit human decision. See [05-worker.md § Identity update semantics](./05-worker.md).

---

## Communication Payloads

### Metrics payload (Probe → Worker)

Sent every 30s via `POST /api/ingest`. Full metric definitions in [01-metrics-catalogue.md § Real-Time Signals](./01-metrics-catalogue.md).

```typescript
// @bat/shared — packages/shared/src/metrics.ts
interface MetricsPayload {
  probe_version?: string;
  host_id: string;
  timestamp: number;        // Unix seconds, Probe clock
  interval: number;         // 30
  cpu: {
    load1: number;
    load5: number;
    load15: number;
    usage_pct: number;
    iowait_pct: number;
    steal_pct: number;
    count: number;
    // Tier 3 extensions (optional — omitted by probes < v0.4.0)
    context_switches_sec?: number;  // ctxt delta / elapsed
    forks_sec?: number;             // processes delta / elapsed
    procs_running?: number;
    procs_blocked?: number;
  };
  mem: {
    total_bytes: number;
    available_bytes: number;
    used_pct: number;
    // Tier 3 extension
    oom_kills_delta?: number;  // delta since last sample
  };
  swap: {
    total_bytes: number;
    used_bytes: number;
    used_pct: number;
  };
  disk: DiskMetric[];
  net: NetMetric[];
  uptime_seconds: number;
  // Tier 3 additions (optional — omitted by probes < v0.4.0)
  psi?: PsiMetrics;        // /proc/pressure/{cpu,memory,io}
  disk_io?: DiskIoMetric[]; // /proc/diskstats
  tcp?: TcpMetrics;         // /proc/net/sockstat
  fd?: FdMetrics;           // /proc/sys/fs/file-nr
}

interface DiskMetric {
  mount: string;
  total_bytes: number;
  avail_bytes: number;
  used_pct: number;
}

interface NetMetric {
  iface: string;
  rx_bytes_rate: number;    // bytes/sec over interval
  tx_bytes_rate: number;
  rx_errors: number;        // error count delta in this interval (not cumulative counter)
  tx_errors: number;        // error count delta in this interval (not cumulative counter)
  // NOTE: rx_packets/tx_packets from 01-metrics-catalogue.md are intentionally
  // excluded from the MVP payload. Packet rates add payload size without
  // actionable alerting value. Bytes + errors are sufficient for MVP.
  // Add in post-MVP if per-packet analysis is needed.
}

// --- Tier 3 types (added in v0.4.0, design in 09-tier3-signals.md) ---

interface PsiMetrics {
  cpu_some_avg10: number;
  cpu_some_avg60: number;
  cpu_some_avg300: number;
  mem_some_avg10: number;
  mem_some_avg60: number;
  mem_some_avg300: number;
  mem_full_avg10: number;
  mem_full_avg60: number;
  mem_full_avg300: number;
  io_some_avg10: number;
  io_some_avg60: number;
  io_some_avg300: number;
  io_full_avg10: number;
  io_full_avg60: number;
  io_full_avg300: number;
}

interface DiskIoMetric {
  device: string;
  read_iops: number;
  write_iops: number;
  read_bytes_sec: number;
  write_bytes_sec: number;
  io_util_pct: number;
}

interface TcpMetrics {
  established: number;  // TCP inuse (ESTABLISHED + CLOSE_WAIT)
  time_wait: number;
  orphan: number;
  allocated: number;    // total TCP sockets including all states
}

interface FdMetrics {
  allocated: number;
  max: number;
}
```

### Identity payload (Probe → Worker)

Sent on startup + every 6h via `POST /api/identity`. Metric definitions in [01-metrics-catalogue.md § Host Identity](./01-metrics-catalogue.md).

```typescript
// @bat/shared — packages/shared/src/identity.ts
interface IdentityPayload {
  host_id: string;
  hostname: string;
  os: string;               // PRETTY_NAME from /etc/os-release
  kernel: string;           // from /proc/version
  arch: string;             // uname -m
  cpu_model: string;        // from /proc/cpuinfo
  uptime_seconds: number;
  boot_time: number;        // computed: now() - uptime
}
```

### D1 column mapping

How payloads map to D1 columns (Worker performs this flattening at ingest time):

| Payload field | D1 table | D1 column | Notes |
|---------------|----------|-----------|-------|
| `timestamp` | `metrics_raw` | `ts` | Probe time |
| `cpu.load1` | `metrics_raw` | `cpu_load1` | |
| `cpu.usage_pct` | `metrics_raw` | `cpu_usage_pct` | |
| `cpu.iowait_pct` | `metrics_raw` | `cpu_iowait` | |
| `cpu.steal_pct` | `metrics_raw` | `cpu_steal` | |
| `cpu.count` | `metrics_raw` | `cpu_count` | |
| `mem.total_bytes` | `metrics_raw` | `mem_total` | |
| `mem.available_bytes` | `metrics_raw` | `mem_available` | |
| `mem.used_pct` | `metrics_raw` | `mem_used_pct` | |
| `swap.total_bytes` | `metrics_raw` | `swap_total` | |
| `swap.used_bytes` | `metrics_raw` | `swap_used` | |
| `swap.used_pct` | `metrics_raw` | `swap_used_pct` | |
| `disk` (array) | `metrics_raw` | `disk_json` | `JSON.stringify()` |
| `net` (array) | `metrics_raw` | `net_json` | `JSON.stringify()` |
| `uptime_seconds` | `metrics_raw` | `uptime_seconds` | |

---

## Alert Rules

6 Tier-1 rules for MVP, aligned with [01-metrics-catalogue.md § Alert rules](./01-metrics-catalogue.md). The full catalogue defines 15 rules total — 6 MVP + 9 deferred (8 Tier-2-dependent + 1 Tier-1 low-priority). Deferred rules are implemented post-MVP when Tier 2 collection is added.

| Rule ID | Field | Condition | Severity | Duration | From 01 spec |
|---------|-------|-----------|----------|----------|--------------|
| `mem_high` | `mem.used_pct` + `swap.used_pct` | mem > 85 AND swap > 50 | critical | instant | "tongji OOM risk" |
| `no_swap` | `swap.total_bytes` + `mem.used_pct` | swap == 0 AND mem > 70 | critical | instant | "tongji had 0 swap" |
| `disk_full` | `disk.*.used_pct` | > 85 | critical | instant | "tongji root at 71%" |
| `iowait_high` | `cpu.iowait_pct` | > 20 | warning | 5 min | "docker 30-34% iowait" |
| `steal_high` | `cpu.steal_pct` | > 10 | warning | 5 min | "oversold VPS detection" |
| `host_offline` | `hosts.last_seen` | > 120s ago | critical | query-time | implicit |

**Note**: [01-metrics-catalogue.md](./01-metrics-catalogue.md) defines a standalone "uptime anomaly" rule (`uptime_seconds < 300`, info severity) — deferred to post-MVP due to low priority. CPU load has no standalone rule (context-dependent per-host).

### Alert evaluation semantics

- **Instant rules** (mem_high, no_swap, disk_full): Threshold exceeded → fire immediately. UPSERT into `alert_states`. Clear when condition no longer met.
- **Duration rules** (iowait_high, steal_high): Track in `alert_pending` with `first_seen` timestamp. Promote to `alert_states` after sustained 5 minutes. Clear both tables when condition no longer met.
- **Offline detection** (host_offline): NOT evaluated during ingest — evaluated at health endpoint query time by comparing `hosts.last_seen` against `Date.now()`.

### Alert type definitions

```typescript
// @bat/shared — packages/shared/src/alerts.ts
interface AlertRule {
  id: string;               // e.g. "mem_high"
  severity: "warning" | "critical";
  duration_seconds: number; // 0 = instant, 300 = 5 min
}

interface AlertState {
  host_id: string;
  rule_id: string;
  severity: "warning" | "critical";
  value: number;
  triggered_at: number;     // Worker time
  message: string;
}

interface HealthResponse {
  status: "healthy" | "degraded" | "critical" | "empty";
  total_hosts: number;
  healthy: number;
  warning: number;
  critical: number;
  checked_at: number;
}
```

### Threshold constants

```typescript
// @bat/shared — packages/shared/src/constants.ts
export const ALERT_THRESHOLDS = {
  MEM_HIGH_PCT: 85,
  MEM_HIGH_SWAP_PCT: 50,
  NO_SWAP_MEM_PCT: 70,
  DISK_FULL_PCT: 85,
  IOWAIT_HIGH_PCT: 20,
  STEAL_HIGH_PCT: 10,
  OFFLINE_SECONDS: 120,
  IOWAIT_DURATION_SECONDS: 300,
  STEAL_DURATION_SECONDS: 300,
} as const;

export const RETENTION = {
  RAW_DAYS: 7,
  HOURLY_DAYS: 90,
} as const;

export const INTERVALS = {
  METRICS_SECONDS: 30,
  IDENTITY_HOURS: 6,
  CLOCK_SKEW_MAX_SECONDS: 300,
} as const;
```

---

## Response DTOs (Worker → Dashboard)

Response types for Worker read routes. Consumed by Dashboard proxy and SWR hooks. These are the contracts between Worker and Dashboard.

### GET /api/hosts → `HostOverviewItem[]`

```typescript
// @bat/shared — packages/shared/src/api.ts

/** Sparkline data point — one hour of aggregated data */
interface SparklinePoint {
  ts: number;     // unix seconds (hour boundary)
  v: number;      // value (0–100 pct)
}

interface HostOverviewItem {
  hid: string;                 // opaque FNV-1a hash of host_id for URL routing
  host_id: string;
  hostname: string;
  os: string | null;
  kernel: string | null;
  arch: string | null;
  cpu_model: string | null;
  boot_time: number | null;
  status: "healthy" | "warning" | "critical" | "offline";
  cpu_usage_pct: number | null;    // latest metrics_raw value
  mem_used_pct: number | null;     // latest metrics_raw value
  uptime_seconds: number | null;   // latest metrics_raw value
  last_seen: number;               // unix seconds (Worker time)
  alert_count: number;             // count of active alerts for this host
  // Host inventory scalar fields (for list-page subtitle)
  cpu_logical: number | null;
  cpu_physical: number | null;
  mem_total_bytes: number | null;
  virtualization: string | null;
  public_ip: string | null;
  // Extended overview fields
  probe_version: string | null;
  cpu_load1: number | null;
  swap_used_pct: number | null;
  disk_root_used_pct: number | null;
  net_rx_rate: number | null;      // bytes/sec aggregate
  net_tx_rate: number | null;      // bytes/sec aggregate
  cpu_sparkline: SparklinePoint[] | null;  // 24h hourly CPU usage
  mem_sparkline: SparklinePoint[] | null;  // 24h hourly Memory usage
}
```

**Status derivation**: `"offline"` if `last_seen` stale > 120s → `"critical"` if any critical alert → `"warning"` if any warning alert → `"healthy"`. Query strategy in [05-worker.md § GET /api/hosts](./05-worker.md).

### GET /api/hosts/:id → `HostDetailItem`

```typescript
// @bat/shared — packages/shared/src/api.ts
interface HostDetailItem extends HostOverviewItem {
  probe_version: string | null;
  swap_total_bytes: number | null;
  boot_mode: string | null;
  timezone: string | null;
  dns_resolvers: string[] | null;
  dns_search: string[] | null;
  net_interfaces: NetInterfaceDTO[] | null;
  disks: BlockDeviceDTO[] | null;
}
```

Extends the overview item with full identity fields and host inventory data. Used by the host detail page.

### GET /api/hosts/:id/tier2 → `Tier2Snapshot`

```typescript
// @bat/shared — packages/shared/src/tier2.ts
interface Tier2Snapshot {
  host_id: string;
  ts: number;
  ports: ServicePortsData | null;
  updates: PackageUpdatesData | null;
  systemd: SystemdServicesData | null;
  security: SecurityPostureData | null;
  docker: DockerStatusData | null;
  disk_deep: DiskDeepScanData | null;
  timezone: string | null;
  dns_resolvers: string[] | null;
  dns_search: string[] | null;
}
```

Returns the latest Tier-2 snapshot. Each JSON column is parsed by the Worker and returned as typed data. `null` fields indicate data not yet collected. Full type definitions in `packages/shared/src/tier2.ts`.

### GET /api/hosts/:id/metrics → `MetricsQueryResponse`

```typescript
// @bat/shared — packages/shared/src/api.ts
interface MetricsQueryResponse {
  host_id: string;
  resolution: "raw" | "hourly";    // which table was queried
  from: number;                     // echoed back
  to: number;                       // echoed back
  data: MetricsDataPoint[];
}

interface MetricsDataPoint {
  ts: number;
  cpu_usage_pct: number | null;
  cpu_iowait: number | null;
  cpu_steal: number | null;
  cpu_load1: number | null;
  cpu_load5: number | null;
  cpu_load15: number | null;
  cpu_count: number | null;
  mem_total: number | null;
  mem_available: number | null;
  mem_used_pct: number | null;
  swap_total: number | null;
  swap_used: number | null;         // raw: swap_used, hourly: swap_used_max
  swap_used_pct: number | null;     // raw: swap_used_pct, hourly: swap_used_pct_avg
  disk_json: string | null;         // JSON string, Dashboard parses (raw: current, hourly: last sample)
  // Network: raw uses net_json, hourly uses scalar fields
  net_json: string | null;          // raw only — JSON string of NetMetric[]
  net_rx_bytes_avg: number | null;  // hourly only — avg rx bytes/sec
  net_rx_bytes_max: number | null;  // hourly only — max rx bytes/sec
  net_tx_bytes_avg: number | null;  // hourly only — avg tx bytes/sec
  net_tx_bytes_max: number | null;  // hourly only — max tx bytes/sec
  net_rx_errors: number | null;     // hourly only — sum of per-interval deltas
  net_tx_errors: number | null;     // hourly only — sum of per-interval deltas
  uptime_seconds: number | null;    // raw: uptime_seconds, hourly: uptime_min
  sample_count?: number;            // hourly only
}
```

**Auto-resolution**: Worker decides based on `to - from`. If > 86400 (24h), query `metrics_hourly`; otherwise, query `metrics_raw`. Dashboard does not specify resolution.

### GET /api/alerts → `AlertItem[]`

```typescript
// @bat/shared — packages/shared/src/api.ts
interface AlertItem {
  hid: string;                    // opaque hash of host_id for URL routing
  host_id: string;
  hostname: string;                 // JOIN from hosts table
  rule_id: string;
  severity: "warning" | "critical";
  value: number | null;
  triggered_at: number;             // unix seconds (Worker time)
  message: string | null;
}
```

---

## API Route Constants

```typescript
// @bat/shared — packages/shared/src/api.ts
export const API_ROUTES = {
  INGEST: "/api/ingest",
  IDENTITY: "/api/identity",
  TIER2_INGEST: "/api/tier2",
  HOSTS: "/api/hosts",
  HOST_DETAIL: "/api/hosts/:id",
  HOST_METRICS: "/api/hosts/:id/metrics",
  HOST_TIER2: "/api/hosts/:id/tier2",
  ALERTS: "/api/alerts",
  LIVE: "/api/live",
} as const;
```

---

## Testing Strategy (this module)

The `@bat/shared` package contains pure type definitions and constants. Testing scope:

### L1 — Unit Tests

| Test file | What |
|-----------|------|
| `alerts.test.ts` | Alert rule definitions are complete (all 6 rules), severity values valid, duration values correct |
| `constants.test.ts` | Threshold values match documented rules, retention/interval values correct |

### L2 — Lint

- Biome strict mode, zero errors + zero warnings
- Typecheck: `tsc --noEmit`

### L3/L4

Not applicable — `@bat/shared` is a pure types/constants package with no runtime behavior or API surface.

### Atomic commits (this module)

| # | Commit | Files | Verify |
|---|--------|-------|--------|
| 1.1 | `feat: add metrics payload types` | `packages/shared/src/metrics.ts` | Typecheck passes |
| 1.2 | `feat: add identity payload types` | `packages/shared/src/identity.ts` | Typecheck passes |
| 1.3 | `feat: add alert types and 6 tier-1 rules` | `packages/shared/src/alerts.ts`, `constants.ts` | Typecheck passes |
| 1.4 | `feat: add api route types, response dtos, and constants` | `packages/shared/src/api.ts`, `index.ts` | Build + typecheck |
| 1.5 | `test: add unit tests for shared types` | `packages/shared/src/__tests__/alerts.test.ts` | `bun test` passes |
