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
4. **Budget-neutral** — Total added cost: ~5 extra file reads per 30s tick, <0.1ms combined.

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
| 19 | Disk I/O saturated | `io_util_pct > 80` for 5 min | warning |

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

## Implementation Plan

### Resource Budget Impact

| Resource | Before T3 | After T3 | Delta |
|----------|----------|---------|-------|
| File reads/tick | ~15 | ~21 | +6 (psi×3, diskstats×1, sockstat×1, file-nr×1) |
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

New columns in `metrics_raw` (all nullable for backward compatibility):

```sql
-- PSI
ALTER TABLE metrics_raw ADD COLUMN psi_cpu_some_avg10 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_cpu_some_avg60 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_mem_some_avg10 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_mem_full_avg10 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_io_some_avg10 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_io_full_avg10 REAL;

-- Disk I/O (JSON array, same pattern as disk/net)
ALTER TABLE metrics_raw ADD COLUMN disk_io TEXT;  -- JSON: [{device, read_iops, write_iops, ...}]

-- TCP
ALTER TABLE metrics_raw ADD COLUMN tcp_established INTEGER;
ALTER TABLE metrics_raw ADD COLUMN tcp_time_wait INTEGER;

-- System
ALTER TABLE metrics_raw ADD COLUMN context_switches_sec REAL;
ALTER TABLE metrics_raw ADD COLUMN oom_kills INTEGER;
ALTER TABLE metrics_raw ADD COLUMN fd_allocated INTEGER;
```

### Worker Aggregation

PSI, TCP, and fd metrics aggregate with `AVG()` + `MAX()` in hourly rollup. Disk I/O aggregates same as network metrics (`AVG` for rates). OOM kills aggregate with `SUM()` (count of kills per hour).

---

## New Alert Rules Summary

| # | Alert | Condition | Severity | Source |
|---|-------|-----------|----------|--------|
| 16 | CPU pressure | `psi.cpu_some_avg60 > 25` for 5 min | warning | `/proc/pressure/cpu` |
| 17 | Memory pressure | `psi.mem_some_avg60 > 10` for 5 min | warning | `/proc/pressure/memory` |
| 18 | I/O pressure | `psi.io_some_avg60 > 20` for 5 min | warning | `/proc/pressure/io` |
| 19 | Disk I/O saturated | `disk_io.io_util_pct > 80` for 5 min | warning | `/proc/diskstats` |
| 20 | TCP connection leak | `tcp.time_wait > 500` for 5 min | warning | `/proc/net/sockstat` |
| 21 | OOM kill detected | `oom_kills_delta > 0` (instant) | critical | `/proc/vmstat` |

All T3 alert rules use Tier 1 data (30s cadence). Total alert count: 15 (existing) + 6 = **21 rules**.
