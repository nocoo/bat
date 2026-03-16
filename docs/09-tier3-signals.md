# 09 — Tier 3 Signals: Procfs-Native System Metrics

> Lightweight T1 signal expansion — pure procfs reads, zero external commands, zero new dependencies.
> Fills the largest observability gaps identified by comparing bat-probe against Netdata on jp.nocoo.cloud.
>
> Related documents:
> - [01-metrics-catalogue.md](./01-metrics-catalogue.md) — Existing T1 + T2 catalogue
> - [03-data-structures.md](./03-data-structures.md) — Payload types, D1 schema
> - [04-probe.md](./04-probe.md) — Probe architecture, main loop, collectors

---

## Motivation

Netdata on jp.nocoo.cloud exposes ~700 charts consuming 237 MB RSS. 490 of those are per-process metrics (apps.plugin) with poor signal-to-noise ratio. The remaining ~210 system-level charts reveal 6 signal categories that bat-probe completely lacks, all readable from procfs at near-zero cost.

### Gap analysis (Netdata vs bat-probe)

| Signal | Netdata | bat-probe T1 | bat-probe T2 | Gap |
|--------|---------|-------------|-------------|-----|
| CPU per-state (user/system/nice/irq/softirq) | ✅ | ❌ aggregate only | — | Low priority (aggregate sufficient for alerting) |
| **PSI pressure (cpu/mem/io)** | ✅ avg10/60/300 | ❌ | — | **Critical** — superior to load average |
| **Disk I/O (IOPS, throughput)** | ✅ per-device | ❌ | — | **Critical** — biggest blind spot |
| **TCP connection state** | ✅ established/tw/orphan | ❌ | listening ports | **High** — connection leak/DDoS signal |
| Context switches + forks | ✅ | ❌ | — | Medium — available from existing `/proc/stat` read |
| OOM kills | ✅ | ❌ | — | Medium — critical for small-memory VPS |
| File descriptor usage | ✅ | ❌ | — | Low — near-zero read cost |
| Memory breakdown (buffers/cached/slab) | ✅ | ❌ | — | Skip — `available_bytes` sufficient |
| Per-process CPU/mem | ✅ (490 charts) | ❌ | — | Skip — O(n) scan, 120MB+ cost |
| netfilter conntrack | ✅ | ❌ | — | Skip — niche, firewall tuning only |

---

## Design Principles

1. **procfs-only** — Every signal reads a virtual file. No `fork()`, no external commands, no root required.
2. **Delta-compatible** — Counters use the same delta/rate pattern as existing CPU jiffies and network bytes.
3. **Additive payload** — New fields are `Option<T>` with `skip_serializing_if`. Older workers ignore unknown fields. Older probes omit them.
4. **Low overhead** — Total added cost: 7 extra file reads per 30s tick (psi×3, diskstats×1, sockstat×1, vmstat×1, file-nr×1), <0.1ms combined. Context switches/forks extracted from existing `/proc/stat` read at zero additional I/O.

---

## Signals

### 3.1 PSI Pressure (Priority: Critical)

**Why**: PSI (Pressure Stall Information) measures the percentage of time tasks are stalled waiting for a resource. Unlike load average (which counts runnable tasks), PSI directly answers "are my workloads being delayed?" A host with load 0.5 but `cpu.some.avg10 = 30%` is genuinely resource-starved — load average hides this.

**Source**: `/proc/pressure/{cpu,memory,io}` (Linux 4.20+, kernel config `CONFIG_PSI=y`)

```
# /proc/pressure/cpu
some avg10=2.40 avg60=2.13 avg300=1.40 total=1627410488
full avg10=0.00 avg60=0.00 avg300=0.00 total=0

# /proc/pressure/memory
some avg10=0.00 avg60=0.00 avg300=0.00 total=0
full avg10=0.00 avg60=0.00 avg300=0.00 total=0

# /proc/pressure/io
some avg10=0.00 avg60=0.01 avg300=0.00 total=23982867
full avg10=0.00 avg60=0.00 avg300=0.00 total=21296068
```

**Parse**: 3 file reads. Each file has `some` and `full` lines. Extract `avg10`, `avg60`, `avg300` as f64.

**Graceful degradation**: If `/proc/pressure/` does not exist (kernel < 4.20 or `CONFIG_PSI=n`), emit `None`. All fleet hosts run kernels ≥ 5.10 where PSI is default-on.

**Payload**:

```rust
#[derive(Debug, Serialize)]
pub struct PsiMetrics {
    pub cpu_some_avg10: f64,
    pub cpu_some_avg60: f64,
    pub cpu_some_avg300: f64,
    pub mem_some_avg10: f64,
    pub mem_some_avg60: f64,
    pub mem_some_avg300: f64,
    pub mem_full_avg10: f64,
    pub mem_full_avg60: f64,
    pub mem_full_avg300: f64,
    pub io_some_avg10: f64,
    pub io_some_avg60: f64,
    pub io_some_avg300: f64,
    pub io_full_avg10: f64,
    pub io_full_avg60: f64,
    pub io_full_avg300: f64,
}
```

**Alert rules**:

| # | Alert | Condition | Severity |
|---|-------|-----------|----------|
| 16 | CPU pressure | `cpu_some_avg60 > 25` for 5 min | warning |
| 17 | Memory pressure | `mem_some_avg60 > 10` for 5 min | warning |
| 18 | I/O pressure | `io_some_avg60 > 20` for 5 min | warning |

**File**: `probe/src/collectors/psi.rs`
**Estimated lines**: ~60

---

### 3.2 Disk I/O (Priority: Critical)

**Why**: bat-probe tracks disk *space* but has zero visibility into disk *performance*. The docker.nocoo.cloud audit showed 30-34% iowait with no way to identify which device or whether the bottleneck was read vs write. This is the single largest observability gap.

**Source**: `/proc/diskstats`

```
   8       0 sda 8261 2726 977710 3044 142388 55672 2598810 70786 0 11380 80985 ...
```

Fields (0-indexed after device name):
- Field 0: reads completed
- Field 2: sectors read (× 512 = bytes)
- Field 4: writes completed
- Field 6: sectors written (× 512 = bytes)
- Field 9: weighted time spent doing I/O (ms) — for utilization %

**Parse**: 1 file read. Filter to whole devices (exclude partitions: skip entries where field 2 of `/proc/diskstats` matches `sda1`, `sda2`, etc. — use heuristic: name ends with digit AND has a parent device without trailing digit). Also skip `loop*`, `ram*`, `dm-*` unless they have non-zero I/O.

**Delta calculation**: Same pattern as network counters — store previous sample, compute delta, divide by elapsed seconds.

**Payload**:

```rust
#[derive(Debug, Serialize)]
pub struct DiskIoMetric {
    pub device: String,
    pub read_iops: f64,       // reads completed / elapsed
    pub write_iops: f64,      // writes completed / elapsed
    pub read_bytes_sec: f64,  // sectors_read × 512 / elapsed
    pub write_bytes_sec: f64, // sectors_written × 512 / elapsed
    pub io_util_pct: f64,     // weighted_io_ms delta / (elapsed_ms) × 100, capped at 100
}
```

**Alert rules**:

| # | Alert | Condition | Severity |
|---|-------|-----------|----------|
| 19 | Disk I/O saturated | ANY device `io_util_pct > 80` for 5 min | warning |

**File**: `probe/src/collectors/disk_io.rs`
**Estimated lines**: ~80

---

### 3.3 TCP Connection State (Priority: High)

**Why**: The T2 ports scan tells us what's *listening*, but not what's *connected*. A web server with 500 TIME_WAIT connections is leaking. A host with 0 ESTABLISHED and 50 orphaned connections is under attack. This is a 200-byte file read.

**Source**: `/proc/net/sockstat`

```
sockets: used 179
TCP: inuse 6 orphan 0 tw 26 alloc 19 mem 10
UDP: inuse 4 mem 0
UDPLITE: inuse 0
RAW: inuse 0
FRAG: inuse 0 memory 0
```

**Parse**: 1 file read. Extract from `TCP:` line: `inuse` (ESTABLISHED+CLOSE_WAIT), `orphan`, `tw` (TIME_WAIT), `alloc` (total allocated sockets).

**Payload**:

```rust
#[derive(Debug, Serialize)]
pub struct TcpMetrics {
    pub established: u32,  // inuse
    pub time_wait: u32,    // tw
    pub orphan: u32,       // orphan
    pub allocated: u32,    // alloc (total TCP sockets including all states)
}
```

**Alert rules**:

| # | Alert | Condition | Severity |
|---|-------|-----------|----------|
| 20 | TCP connection leak | `time_wait > 500` for 5 min | warning |

**File**: `probe/src/collectors/tcp.rs`
**Estimated lines**: ~40

---

### 3.4 Context Switches + Process Forks (Priority: Medium)

**Why**: Available for free — `/proc/stat` is already read every tick for CPU jiffies. Two additional lines to extract. A sudden spike in context switches (>50k/s on a 1-core VPS) or forks (>100/s) indicates runaway processes or fork bombs.

**Source**: `/proc/stat` (already read by `collectors/cpu.rs`)

```
ctxt 1234567890    ← total context switches since boot
processes 56789    ← total forks since boot
procs_running 2
procs_blocked 0
```

**Parse**: Zero additional file reads. Extend existing `read_jiffies()` to also extract `ctxt`, `processes`, `procs_running`, `procs_blocked`. Delta `ctxt` and `processes` to get per-second rates.

**Payload** (extend existing `CpuMetrics`):

```rust
pub struct CpuMetrics {
    // ... existing fields ...
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_switches_sec: Option<f64>,  // ctxt delta / elapsed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub forks_sec: Option<f64>,             // processes delta / elapsed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub procs_running: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub procs_blocked: Option<u32>,
}
```

**Alert rules**: None initially — use as diagnostic context when CPU alerts fire.

**File**: Modify `probe/src/collectors/cpu.rs`
**Estimated lines**: ~20 additional

---

### 3.5 OOM Kills (Priority: Medium)

**Why**: On small-memory VPS (1-2 GB), OOM kills are the #1 cause of unexplained service death. tongji.nocoo.cloud had zero swap + 75% memory usage — one OOM kill away from losing MySQL. A cumulative counter delta catches kills that happen between probe ticks.

**Source**: `/proc/vmstat` line `oom_kill`

```
oom_kill 0
```

**Parse**: 1 file read (can be combined with existing meminfo read cycle). Grep for `oom_kill` line. Store as cumulative counter, emit delta.

**Payload** (extend existing `MemMetrics`):

```rust
pub struct MemMetrics {
    // ... existing fields ...
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oom_kills_delta: Option<u64>,  // delta since last sample
}
```

**Alert rules**:

| # | Alert | Condition | Severity |
|---|-------|-----------|----------|
| 21 | OOM kill detected | `oom_kills_delta > 0` | critical |

**File**: `probe/src/collectors/memory.rs` (extend)
**Estimated lines**: ~15 additional

---

### 3.6 File Descriptor Usage (Priority: Low)

**Why**: Near-zero cost to read. Exhausting system-wide fd limit causes "Too many open files" errors across all processes.

**Source**: `/proc/sys/fs/file-nr`

```
1344	0	9223372036854775807
```

Fields: `allocated  free  max`. Note: `free` is always 0 on modern kernels — allocated fds are tracked per-process. Use `allocated / max × 100` for utilization.

**Parse**: 1 file read, ~30 bytes.

**Payload**:

```rust
pub struct FdMetrics {
    pub allocated: u64,
    pub max: u64,
}
```

**Alert rules**: None initially — extremely unlikely to exhaust on managed VPS. Useful as diagnostic context.

**File**: `probe/src/collectors/fd.rs`
**Estimated lines**: ~10

---

## Excluded Signals (with rationale)

| Signal | Netdata has it | Why excluded |
|--------|---------------|--------------|
| Per-process CPU/mem | ✅ 490 charts via apps.plugin | O(n) procfs scan per process. Needs setuid or `CAP_DAC_READ_SEARCH`. 120MB+ RSS. Noise ≫ signal for fleet monitoring. |
| Memory breakdown (buffers/cached/slab) | ✅ | `available_bytes` already accounts for reclaimable pages. No additional alerting value. |
| CPU per-state breakdown | ✅ user/system/nice/irq/softirq | Aggregate `usage_pct` is sufficient for alerting. Per-state is diagnostic noise at 30s resolution. |
| netfilter conntrack | ✅ | Only useful for firewall tuning. No alerting value for fleet monitoring. |
| Entropy | ✅ | Modern kernels (≥5.6) use CRNG, entropy pool is always full. Dead metric. |
| Network errors/drops detail | ✅ per-type | Already collecting `rx_errors`/`tx_errors` aggregate in T1. Per-type breakdown (fifo, frame, compressed) is diagnostic noise. |

---

## MetricsPayload Integration

All T3 signals are added as optional fields on the existing `MetricsPayload`. This section is the authoritative reference for how the Rust structs defined above map into the top-level payload and their TypeScript equivalents in `@bat/shared`.

### Rust (`probe/src/payload.rs`)

```rust
#[derive(Debug, Serialize)]
pub struct MetricsPayload {
    // ... existing fields (probe_version, host_id, timestamp, interval, cpu, mem, swap, disk, net, uptime_seconds) ...

    /// Tier 3: PSI pressure — None if kernel < 4.20 or CONFIG_PSI=n
    #[serde(skip_serializing_if = "Option::is_none")]
    pub psi: Option<PsiMetrics>,

    /// Tier 3: Disk I/O per device — delta counters from /proc/diskstats
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disk_io: Option<Vec<DiskIoMetric>>,

    /// Tier 3: TCP connection state summary from /proc/net/sockstat
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tcp: Option<TcpMetrics>,

    /// Tier 3: System-wide file descriptor usage from /proc/sys/fs/file-nr
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fd: Option<FdMetrics>,
}

// CpuMetrics gains 4 optional fields (§3.4):
//   context_switches_sec, forks_sec, procs_running, procs_blocked

// MemMetrics gains 1 optional field (§3.5):
//   oom_kills_delta
```

### TypeScript (`packages/shared/src/metrics.ts`)

```typescript
// New interfaces
export interface PsiMetrics {
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

export interface DiskIoMetric {
  device: string;
  read_iops: number;
  write_iops: number;
  read_bytes_sec: number;
  write_bytes_sec: number;
  io_util_pct: number;
}

export interface TcpMetrics {
  established: number;
  time_wait: number;
  orphan: number;
  allocated: number;
}

export interface FdMetrics {
  allocated: number;
  max: number;
}

// Extended existing interfaces
export interface CpuMetrics {
  // ... existing fields ...
  context_switches_sec?: number;
  forks_sec?: number;
  procs_running?: number;
  procs_blocked?: number;
}

export interface MemMetrics {
  // ... existing fields ...
  oom_kills_delta?: number;
}

// Top-level payload additions
export interface MetricsPayload {
  // ... existing fields ...
  psi?: PsiMetrics;
  disk_io?: DiskIoMetric[];
  tcp?: TcpMetrics;
  fd?: FdMetrics;
}
```

### Wire format example (JSON)

```json
{
  "probe_version": "0.3.0",
  "host_id": "jp.nocoo.cloud",
  "timestamp": 1773699670,
  "interval": 30,
  "cpu": {
    "load1": 0.5, "load5": 0.3, "load15": 0.2,
    "usage_pct": 2.0, "iowait_pct": 0.0, "steal_pct": 0.0, "count": 1,
    "context_switches_sec": 889.9, "forks_sec": 7.1,
    "procs_running": 1, "procs_blocked": 0
  },
  "mem": {
    "total_bytes": 1085284352, "available_bytes": 113967104, "used_pct": 89.5,
    "oom_kills_delta": 0
  },
  "swap": { "total_bytes": 1677709312, "used_bytes": 29360128, "used_pct": 1.7 },
  "disk": [{ "mount": "/", "total_bytes": 21474836480, "avail_bytes": 15032385536, "used_pct": 30.0 }],
  "net": [{ "iface": "eth0", "rx_bytes_rate": 1024.5, "tx_bytes_rate": 512.3, "rx_errors": 0, "tx_errors": 0 }],
  "uptime_seconds": 2764800,
  "psi": {
    "cpu_some_avg10": 2.40, "cpu_some_avg60": 2.13, "cpu_some_avg300": 1.40,
    "mem_some_avg10": 0.0, "mem_some_avg60": 0.0, "mem_some_avg300": 0.0,
    "mem_full_avg10": 0.0, "mem_full_avg60": 0.0, "mem_full_avg300": 0.0,
    "io_some_avg10": 0.0, "io_some_avg60": 0.01, "io_some_avg300": 0.0,
    "io_full_avg10": 0.0, "io_full_avg60": 0.0, "io_full_avg300": 0.0
  },
  "disk_io": [
    { "device": "sda", "read_iops": 0.0, "write_iops": 12.0, "read_bytes_sec": 0.0, "write_bytes_sec": 49152.0, "io_util_pct": 3.2 }
  ],
  "tcp": { "established": 6, "time_wait": 26, "orphan": 0, "allocated": 19 },
  "fd": { "allocated": 1344, "max": 9223372036854775807 }
}
```

---

## Implementation Plan

### Resource Budget Impact

| Resource | Before T3 | After T3 | Delta |
|----------|----------|---------|-------|
| File reads/tick | ~15 | ~22 | +7 (psi×3, diskstats×1, sockstat×1, vmstat×1, file-nr×1; ctxt/forks from existing /proc/stat) |
| Payload size | ~800 bytes | ~1100 bytes | +300 bytes |
| State (prev counters) | cpu_jiffies + net_counters | + disk_io_counters + oom_counter | ~200 bytes |
| Code | ~4800 lines | ~5025 lines | +225 lines |
| RSS | < 15 MB | < 15 MB | negligible |
| CPU per tick | < 1ms | < 1.1ms | < 0.1ms |

### Atomic Commits

| # | Commit | Files | Verify |
|---|--------|-------|--------|
| 1 | `feat: add PSI pressure collector` | `collectors/psi.rs`, `payload.rs`, `orchestrate.rs`, `main.rs` | `cargo test` — parse fixture, graceful None on missing |
| 2 | `feat: add disk I/O collector` | `collectors/disk_io.rs`, `payload.rs`, `orchestrate.rs`, `main.rs` | `cargo test` — parse diskstats fixture, delta calc, partition filtering |
| 3 | `feat: add TCP connection state collector` | `collectors/tcp.rs`, `payload.rs`, `orchestrate.rs`, `main.rs` | `cargo test` — parse sockstat fixture |
| 4 | `feat: extend CPU collector with ctxt/forks/procs` | `collectors/cpu.rs`, `payload.rs`, `orchestrate.rs` | `cargo test` — parse extended /proc/stat, delta ctxt/forks |
| 5 | `feat: add OOM kill counter to memory collector` | `collectors/memory.rs`, `payload.rs`, `orchestrate.rs`, `main.rs` | `cargo test` — parse vmstat fixture, delta calc |
| 6 | `feat: add file descriptor usage collector` | `collectors/fd.rs`, `payload.rs`, `orchestrate.rs`, `main.rs` | `cargo test` — parse file-nr fixture |
| 7 | `feat: add T3 worker ingest + D1 columns` | `packages/worker/`, `packages/shared/` | `bun test` — new columns accepted, old payloads still work |
| 8 | `feat: add T3 alert rules (#16-21)` | `packages/worker/src/services/alerts.ts` | `bun test` — PSI/disk IO/TCP/OOM alert evaluation |
| 9 | `feat: add T3 dashboard charts` | `packages/dashboard/` | Visual — PSI gauge, disk I/O timeline, TCP state bar |

### D1 Schema Additions

New columns in `metrics_raw` (all nullable for backward compatibility). Every column listed here maps 1:1 to a payload field or is required by an alert rule. No field from the payload structs or alert conditions is omitted.

```sql
-- PSI (all 6 avg60 values stored for alerting; avg10/avg300 for dashboard charts)
-- Alert #16 depends on psi_cpu_some_avg60
-- Alert #17 depends on psi_mem_some_avg60
-- Alert #18 depends on psi_io_some_avg60
ALTER TABLE metrics_raw ADD COLUMN psi_cpu_some_avg10 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_cpu_some_avg60 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_cpu_some_avg300 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_mem_some_avg10 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_mem_some_avg60 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_mem_some_avg300 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_mem_full_avg10 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_mem_full_avg60 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_mem_full_avg300 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_io_some_avg10 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_io_some_avg60 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_io_some_avg300 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_io_full_avg10 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_io_full_avg60 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_io_full_avg300 REAL;

-- Disk I/O (JSON array, same pattern as disk/net)
-- Alert #19 evaluates io_util_pct from within the JSON
ALTER TABLE metrics_raw ADD COLUMN disk_io TEXT;  -- JSON: [{device, read_iops, write_iops, read_bytes_sec, write_bytes_sec, io_util_pct}]

-- TCP (all 4 fields from TcpMetrics)
-- Alert #20 depends on tcp_time_wait
ALTER TABLE metrics_raw ADD COLUMN tcp_established INTEGER;
ALTER TABLE metrics_raw ADD COLUMN tcp_time_wait INTEGER;
ALTER TABLE metrics_raw ADD COLUMN tcp_orphan INTEGER;
ALTER TABLE metrics_raw ADD COLUMN tcp_allocated INTEGER;

-- CPU extensions (from CpuMetrics, §3.4)
ALTER TABLE metrics_raw ADD COLUMN context_switches_sec REAL;
ALTER TABLE metrics_raw ADD COLUMN forks_sec REAL;
ALTER TABLE metrics_raw ADD COLUMN procs_running INTEGER;
ALTER TABLE metrics_raw ADD COLUMN procs_blocked INTEGER;

-- Memory extensions (from MemMetrics, §3.5)
-- Alert #21 depends on oom_kills
ALTER TABLE metrics_raw ADD COLUMN oom_kills INTEGER;

-- File descriptors (from FdMetrics, §3.6)
ALTER TABLE metrics_raw ADD COLUMN fd_allocated INTEGER;
ALTER TABLE metrics_raw ADD COLUMN fd_max INTEGER;
```

**Cross-reference checklist** (payload field → D1 column → alert dependency):

| Payload field | D1 column | Alert |
|---------------|-----------|-------|
| `psi.cpu_some_avg60` | `psi_cpu_some_avg60` | #16 |
| `psi.mem_some_avg60` | `psi_mem_some_avg60` | #17 |
| `psi.io_some_avg60` | `psi_io_some_avg60` | #18 |
| `disk_io[].io_util_pct` | `disk_io` (JSON) | #19 |
| `tcp.time_wait` | `tcp_time_wait` | #20 |
| `mem.oom_kills_delta` | `oom_kills` | #21 |
| `psi.*` (all 15 fields) | 15 `psi_*` columns | dashboard charts |
| `tcp.established` | `tcp_established` | dashboard |
| `tcp.orphan` | `tcp_orphan` | dashboard |
| `tcp.allocated` | `tcp_allocated` | dashboard |
| `cpu.context_switches_sec` | `context_switches_sec` | diagnostic |
| `cpu.forks_sec` | `forks_sec` | diagnostic |
| `cpu.procs_running` | `procs_running` | diagnostic |
| `cpu.procs_blocked` | `procs_blocked` | diagnostic |
| `fd.allocated` | `fd_allocated` | dashboard |
| `fd.max` | `fd_max` | dashboard |

### Worker Aggregation

Hourly rollup strategy for each new column family:

| Columns | Aggregation | Rationale |
|---------|-------------|-----------|
| `psi_*` (15 cols) | `AVG()` + `MAX()` | Pressure is a percentage; avg shows sustained load, max shows spikes |
| `disk_io` (JSON) | `AVG()` per device per field | Same as existing network rate aggregation |
| `tcp_established`, `tcp_time_wait`, `tcp_orphan`, `tcp_allocated` | `AVG()` + `MAX()` | Gauge values; max catches connection spikes |
| `context_switches_sec`, `forks_sec` | `AVG()` + `MAX()` | Rate values; max catches burst activity |
| `procs_running`, `procs_blocked` | `AVG()` + `MAX()` | Gauge values |
| `oom_kills` | `SUM()` | Counter delta; total kills per hour |
| `fd_allocated`, `fd_max` | `AVG(fd_allocated)`, `MAX(fd_allocated)`, `LAST(fd_max)` | fd_max is static, only latest value needed |

### metrics_hourly Schema Additions

New columns in `metrics_hourly` (all nullable). This is the authoritative list for what the hourly aggregation cron must write. Column naming follows the existing pattern: `{metric}_{agg}` where agg is `avg`, `max`, `min`, or `sum`.

```sql
-- PSI: store avg + max for each of the 6 alert-relevant fields
-- Dashboard uses avg for trend lines, max for spike detection
ALTER TABLE metrics_hourly ADD COLUMN psi_cpu_some_avg10_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_cpu_some_avg10_max REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_cpu_some_avg60_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_cpu_some_avg60_max REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_mem_some_avg60_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_mem_some_avg60_max REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_mem_full_avg60_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_mem_full_avg60_max REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_io_some_avg60_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_io_some_avg60_max REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_io_full_avg60_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_io_full_avg60_max REAL;
-- NOTE: avg300 values are omitted from hourly — they are 5-min kernel averages
-- that don't aggregate meaningfully over 1 hour. avg10 is kept for UI sparklines.
-- Full 15-field PSI data is always available in metrics_raw (24h retention).

-- Disk I/O: JSON array with per-device avg values (same pattern as net_* scalars)
ALTER TABLE metrics_hourly ADD COLUMN disk_io_json TEXT;
-- JSON: [{device, read_iops_avg, write_iops_avg, read_bytes_sec_avg, write_bytes_sec_avg, io_util_pct_avg, io_util_pct_max}]

-- TCP: avg + max for each gauge
ALTER TABLE metrics_hourly ADD COLUMN tcp_established_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN tcp_established_max INTEGER;
ALTER TABLE metrics_hourly ADD COLUMN tcp_time_wait_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN tcp_time_wait_max INTEGER;
ALTER TABLE metrics_hourly ADD COLUMN tcp_orphan_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN tcp_orphan_max INTEGER;
ALTER TABLE metrics_hourly ADD COLUMN tcp_allocated_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN tcp_allocated_max INTEGER;

-- CPU extensions: avg + max for rates, avg + max for gauges
ALTER TABLE metrics_hourly ADD COLUMN context_switches_sec_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN context_switches_sec_max REAL;
ALTER TABLE metrics_hourly ADD COLUMN forks_sec_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN forks_sec_max REAL;
ALTER TABLE metrics_hourly ADD COLUMN procs_running_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN procs_running_max INTEGER;
ALTER TABLE metrics_hourly ADD COLUMN procs_blocked_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN procs_blocked_max INTEGER;

-- OOM kills: sum of deltas in the hour
ALTER TABLE metrics_hourly ADD COLUMN oom_kills_sum INTEGER;

-- File descriptors: avg + max for allocated, last for max (static)
ALTER TABLE metrics_hourly ADD COLUMN fd_allocated_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN fd_allocated_max INTEGER;
ALTER TABLE metrics_hourly ADD COLUMN fd_max INTEGER;  -- last sample (static value)
```

**Column count**: +35 columns in `metrics_hourly` (12 PSI + 1 disk_io JSON + 8 TCP + 8 CPU ext + 1 OOM + 5 FD).

**Cross-reference** — hourly columns needed by long-range alert evaluation:

| Alert | metrics_hourly column used | Query |
|-------|--------------------------|-------|
| #16 CPU pressure | `psi_cpu_some_avg60_max` | `MAX > 25` in sliding window |
| #17 Memory pressure | `psi_mem_some_avg60_max` | `MAX > 10` in sliding window |
| #18 I/O pressure | `psi_io_some_avg60_max` | `MAX > 10` in sliding window |
| #19 Disk I/O saturated | `disk_io_json` → `io_util_pct_max` | per-device MAX > 80 |
| #20 TCP connection leak | `tcp_time_wait_max` | `MAX > 500` in sliding window |
| #21 OOM kill detected | `oom_kills_sum` | `SUM > 0` in any hour |

---

## New Alert Rules Summary

| # | Alert | Condition | Severity | Semantics | Source |
|---|-------|-----------|----------|-----------|--------|
| 16 | CPU pressure | `psi.cpu_some_avg60 > 25` for 5 min | warning | Scalar — single value per sample | `/proc/pressure/cpu` |
| 17 | Memory pressure | `psi.mem_some_avg60 > 10` for 5 min | warning | Scalar — single value per sample | `/proc/pressure/memory` |
| 18 | I/O pressure | `psi.io_some_avg60 > 20` for 5 min | warning | Scalar — single value per sample | `/proc/pressure/io` |
| 19 | Disk I/O saturated | **ANY** `disk_io[].io_util_pct > 80` for 5 min | warning | Array — iterate devices, fire on first match (same pattern as `disk_full` rule #3) | `/proc/diskstats` |
| 20 | TCP connection leak | `tcp.time_wait > 500` for 5 min | warning | Scalar — single value per sample | `/proc/net/sockstat` |
| 21 | OOM kill detected | `mem.oom_kills_delta > 0` (instant) | critical | Scalar — single value per sample | `/proc/vmstat` |

### Alert #19 array semantics (detail)

`disk_io` is a `DiskIoMetric[]` — one entry per block device. The alert iterates the array and fires if **any** device exceeds the threshold. This is identical to how existing alert #3 (`disk_full`) handles the `disk: DiskMetric[]` array:

```typescript
// Worker implementation pattern (same as disk_full):
for (const device of payload.disk_io ?? []) {
    if (device.io_util_pct > ALERT_THRESHOLDS.DISK_IO_UTIL_PCT) {
        results.push({
            ruleId: "disk_io_saturated",
            fired: true,
            severity: "warning",
            value: device.io_util_pct,
            message: `Disk ${device.device} I/O utilization at ${device.io_util_pct.toFixed(1)}%`,
            durationSeconds: 300,
        });
        break; // One alert per host, report worst device
    }
}
```

The message includes the specific device name (e.g. "Disk sda I/O utilization at 85.3%") so the operator knows which device to investigate.

All T3 alert rules use Tier 1 data (30s cadence). Total alert count: 15 (existing) + 6 = **21 rules**.
