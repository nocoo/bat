# 14 — Top Processes: Per-Process CPU & Memory Monitoring

> 30s 周期内采集系统 Top N 进程的 CPU、内存、I/O 等关键指标，在 Dashboard 以表格形式展示，支持排序、过滤和异常着色。
>
> Related documents:
> - [01-metrics-catalogue.md](./01-metrics-catalogue.md) — T1/T2/T3 signal reference
> - [03-data-structures.md](./03-data-structures.md) — D1 schema, payload types
> - [04-probe.md](./04-probe.md) — Probe collectors, main loop
> - [09-tier3-signals.md](./09-tier3-signals.md) — Tier 3 procfs-native design pattern

---

## 1. Motivation

当前 bat-probe 采集系统级 CPU/Memory 指标，但无法回答 **"是哪个进程占了 CPU/内存？"** 这一运维核心问题。Netdata 的 `apps.plugin` 通过 490+ per-process charts 实现，但消耗 120MB+ RSS — 对小内存 VPS（1GB）不可接受。

**目标**：以最低开销（<1ms/cycle、<100KB RSS）采集 Top 50 进程快照，覆盖 CPU、内存、I/O、线程、状态等维度，在 Dashboard 提供可排序、可过滤、异常着色的进程表格。

---

## 2. Data Source: `/proc/[pid]/*`

**不使用 `top` 命令**。直接读 procfs，原因：
- `top` 本身有 fork/exec 开销，输出格式因版本而异
- procfs 是零开销内存文件 I/O，和现有所有 collector 一致
- CPU% 需要两次采样 delta，在 probe 内部管理状态更可靠

### 2.1 Per-Process File Reads

每个进程读取 **3 个文件**：

| File | Parse Cost | Fields Extracted |
|------|-----------|------------------|
| `/proc/[pid]/stat` | 极低（单行，需 comm 括号感知解析，见 §2.2） | pid, comm, state, ppid, utime, stime, num_threads, starttime, vsize, rss, majflt, processor |
| `/proc/[pid]/cmdline` | 极低（单次 read） | full command line（`\0` → space） |
| `/proc/[pid]/io` | 极低（key-value），**默认弱可用**（见 §2.7） | read_bytes, write_bytes |

**不读取的文件及原因**：

| File | Reason to Skip |
|------|---------------|
| `/proc/[pid]/statm` | 与 stat 的 rss/vsize 重复，且 man page 标注 "inaccurate" |
| `/proc/[pid]/status` | 解析开销高（~49 行 key-value），仅 Uid 和 VmSwap 有独特价值 |

### 2.2 `/proc/[pid]/stat` Parse Strategy

**⚠️ 不能简单按空白 split**。`comm` 字段（#2）被 `(...)` 括号包裹，内部可以包含空格、括号等任意字符。例如：

```
1234 (Web Content) S 1230 ...
5678 (kworker/0:1-events) I 2 ...
```

直接按空白切分会导致后续所有字段（state/ppid/utime/rss）错位，解析结果全部错误。

**正确的解析算法**：

```rust
fn parse_proc_stat(content: &str) -> Option<ProcStat> {
    // 1. 找到第一个 '(' 和最后一个 ')'
    let comm_start = content.find('(')?;
    let comm_end = content.rfind(')')?;

    // 2. pid 在 '(' 之前
    let pid: u32 = content[..comm_start].trim().parse().ok()?;

    // 3. comm 在括号之间
    let comm = &content[comm_start + 1..comm_end];

    // 4. ')' 之后的部分才能按空白 split
    let rest = &content[comm_end + 2..]; // skip ") "
    let fields: Vec<&str> = rest.split_whitespace().collect();

    // fields[0] = state (#3), fields[1] = ppid (#4), ...
    // fields[N] 对应 stat 字段 #(N+3)
    let state = fields.get(0)?;
    let ppid: u32 = fields.get(1)?.parse().ok()?;
    let utime: u64 = fields.get(11)?.parse().ok()?;  // field #14, index 11
    let stime: u64 = fields.get(12)?.parse().ok()?;  // field #15, index 12
    // ... etc
}
```

**关键点**：使用 `rfind(')')` 而非 `find(')')`，因为 comm 本身可以包含 `)` 字符。

### 2.3 `/proc/[pid]/stat` 字段详解

52 个字段中，采集以下 12 个：

| # | Field | Type | Purpose |
|---|-------|------|---------|
| 1 | `pid` | u32 | 进程标识 |
| 2 | `comm` | String | 进程名（括号包裹，截断 16 字符） |
| 3 | `state` | char | 进程状态：R(running), S(sleeping), D(disk-sleep), Z(zombie), T(stopped) |
| 4 | `ppid` | u32 | 父进程 PID，用于构建进程树、识别孤儿进程 |
| 14 | `utime` | u64 | 用户态 CPU ticks — **CPU% 计算核心** |
| 15 | `stime` | u64 | 内核态 CPU ticks — **CPU% 计算核心** |
| 20 | `num_threads` | u32 | 线程数 — 高线程数可能指示泄漏 |
| 22 | `starttime` | u64 | 启动时间（boot 后 ticks）— 可算进程 uptime |
| 23 | `vsize` | u64 | 虚拟内存 (bytes) |
| 24 | `rss` | i64 | 驻留内存 (pages) — **内存核心**，需 × `page_size`（运行时通过 `sysconf(_SC_PAGESIZE)` 获取，**不可硬编码 4096**：aarch64 可能为 16KiB/64KiB） |
| 12 | `majflt` | u64 | 主缺页（触发磁盘 I/O）— delta 有性能诊断价值 |
| 39 | `processor` | i32 | 上次运行的 CPU 编号 — NUMA 调试 |

### 2.4 `/proc/[pid]/cmdline`

- 格式：以 `\0` 分隔的参数列表，如 `/usr/sbin/nginx\0-g\0daemon off;\0`
- 读取后 `\0` → 空格，**截断前 200 字节**（防止巨长命令行膨胀 payload）
- 对 zombie 进程为空，此时 fallback 到 `comm`
- **价值**：区分同名进程（多个 `python3` 分别跑什么脚本）

### 2.5 `/proc/[pid]/io`（默认弱可用，见 §2.7）

| Field | Type | Description |
|-------|------|-------------|
| `read_bytes` | u64 | 真正从磁盘读取的字节（累计） |
| `write_bytes` | u64 | 真正写入磁盘的字节（累计） |

- 只取 `read_bytes` / `write_bytes`（物理 I/O），不取 `rchar`/`wchar`（含缓存命中，价值低）
- 权限模型详见 §2.7；读取失败时字段为 `None`，graceful degradation
- delta 计算后转为 bytes/sec

### 2.6 用户名解析

- 使用 `stat()` 系统调用取文件 UID（开销低于解析 `/proc/[pid]/status`）
- **启动时**一次性解析 `/etc/passwd` 构建 `HashMap<u32, String>` (UID → username)
- 缓存不命中时显示 `uid:<N>` fallback

### 2.7 `/proc/[pid]/io` Permission Model — 默认弱可用

bat-probe 当前默认部署以 `bat` 专用用户运行（`docs/04-probe.md:211`，systemd `User=bat / Group=bat`）。`/proc/[pid]/io` 的可读性取决于内核参数和进程归属：

| 条件 | 可读性 | 说明 |
|------|--------|------|
| **自身进程**（UID 匹配） | ✅ 始终可读 | 内核允许进程读取自己的 io |
| **其他用户进程** + `ptrace_scope = 0` | ✅ 可读 | 大多数 VPS 默认值（Ubuntu/Debian） |
| **其他用户进程** + `ptrace_scope = 1` | ❌ 不可读 | 需 `CAP_SYS_PTRACE` 或 root |
| **以 root 运行 probe** | ✅ 全部可读 | 但当前部署不使用 root |

**实际影响**：在当前 VPS 部署环境中（Ubuntu + `ptrace_scope = 1`），probe 以 `bat` 用户运行，**只能读取 `bat` 自有进程的 io**，其他用户（root、www-data 等）的进程 io 字段为 `null`。

**设计决策**：标记为**默认弱可用** —— 不要求部署时修改系统配置或提权，接受部分进程 io 数据缺失。Dashboard 已有 graceful degradation（`io_read_rate: null` → 显示 `—`）。若用户需要完整 io 数据，可通过以下方式提权：

```bash
# 方案 1：给二进制 capability（推荐，最小权限）
sudo setcap cap_sys_ptrace+ep /usr/local/bin/bat-probe

# 方案 2：systemd 配置 AmbientCapabilities
# [Service]
# AmbientCapabilities=CAP_SYS_PTRACE
```

---

## 3. CPU% Calculation

### 3.1 Formula

```
process_cpu_ticks = (utime + stime) @ T2 - (utime + stime) @ T1
system_total_ticks = total_jiffies @ T2 - total_jiffies @ T1   // /proc/stat "cpu" line
cpu_percent = process_cpu_ticks / system_total_ticks * num_cpus * 100
```

### 3.2 Reuse Existing Infrastructure

当前 `cpu.rs` 的 `read_jiffies()` → `CpuJiffies` 已有 `total()` 方法，每 30s tick 已经在读。
直接从 `orchestrate.rs` 传入 `prev_total_jiffies` 和 `curr_total_jiffies` 即可，**零额外 I/O**。

### 3.3 State Management

维护 `HashMap<u32, PrevProcStat>` 存储上一次采样的 per-PID 状态：

```rust
struct PrevProcStat {
    cpu_ticks: u64,       // utime + stime
    majflt: u64,          // for delta
    read_bytes: u64,      // for delta (io)
    write_bytes: u64,     // for delta (io)
}
```

**进程生命周期处理**：
- 新进程（prev 中无 PID）：`cpu_pct = 0`（首次无 delta），其余字段正常采集
- 消失进程（curr 中无 PID）：从 prev map 中移除，不出现在结果中
- PID 复用检测：对比 `starttime`，若不同说明是新进程，重置 delta 基线

---

## 4. Performance & Resource Budget

### 4.1 Overhead Analysis

| Operation | Count per Cycle | Cost |
|-----------|----------------|------|
| List `/proc/` entries | 1 × readdir | ~0.1ms (200 进程) |
| Read `/proc/[pid]/stat` | ~200 × read | ~0.2ms total |
| Read `/proc/[pid]/cmdline` | ~200 × read | ~0.2ms total |
| Read `/proc/[pid]/io` | ~200 × read | ~0.1ms total |
| Parse + sort + truncate | 1 | ~0.05ms |
| **Total** | — | **< 1ms per 30s cycle** |

**对比**：
- Netdata `apps.plugin`：~10ms/cycle + 120MB RSS (per-process tracking for ALL processes, all metrics)
- bat top_processes：< 1ms/cycle + < 100KB RSS delta (fixed 50-entry output)

### 4.2 Two-Phase Collection Strategy

为了最小化文件 I/O，使用两阶段策略：

**Phase 1 — Scan (read ALL /proc/[pid]/stat)**：
- 遍历 `/proc/` 目录，过滤纯数字目录名（即 PID）
- 每个 PID 只读 `/proc/[pid]/stat`（单次 read，按 comm-aware 规则解析单行，见 §2.2）
- 计算 CPU% delta 和 RSS
- **按 CPU% 降序排序，取 Top 50**

**Phase 2 — Enrich (read cmdline + io for Top 50 only)**：
- 仅对 Top 50 进程读取 `/proc/[pid]/cmdline` 和 `/proc/[pid]/io`
- 将 50 × 2 = 100 次额外 read 控制在最小范围

**为什么是 Top 50**：
- Phase 1 必须扫描全部进程（~200 个），但每个只读 1 个文件 × 1 行 = 极低开销
- Phase 2 的 cmdline + io 开销更大（cmdline 可能数 KB），限制在 Top 50 控制总量
- 50 个进程覆盖绝大多数问题场景（CPU hog、内存泄漏、I/O storm）

### 4.3 Memory Overhead

| Component | Size |
|-----------|------|
| `prev_proc_stats` HashMap (200 entries) | ~20KB |
| uid→username cache | ~5KB |
| Current cycle process list (50 entries) | ~30KB |
| **Total RSS delta** | **< 60KB** |

### 4.4 Payload Size

每个进程 JSON ~250 bytes：
```json
{"pid":1234,"name":"nginx","cmd":"nginx: worker process","state":"S","ppid":1230,
 "user":"www-data","cpu_pct":12.3,"mem_rss":268435456,"mem_pct":6.2,"mem_virt":536870912,
 "num_threads":4,"uptime":86400,"majflt_rate":0.0,"io_read_rate":1024,"io_write_rate":2048,
 "processor":2}
```

50 processes × 250B = **~12.5KB per payload**，30s 一次 = 36KB/min = 2.1MB/hour — 完全可接受。

### 4.5 Graceful Degradation

| Scenario | Behavior |
|----------|----------|
| `/proc/[pid]/stat` read fails (EPERM/ENOENT) | Skip this PID, continue scanning |
| `/proc/[pid]/io` read fails (non-root) | `io_read_rate: null, io_write_rate: null` |
| `/proc/[pid]/cmdline` empty (zombie) | Fallback to `comm` from stat |
| System has < 50 processes | Return all processes |
| PID reuse between cycles | Detect via `starttime` mismatch, reset delta |
| First cycle (no prev state) | `cpu_pct: null` for all processes（和现有 CPU/net metrics 一致） |

---

## 5. Data Structure

### 5.1 Probe Payload

```rust
#[derive(Debug, Serialize)]
pub struct TopProcess {
    pub pid: u32,
    pub name: String,           // comm (≤16 chars)
    pub cmd: String,            // cmdline (≤200 bytes, \0→space)
    pub state: String,          // R/S/D/Z/T
    pub ppid: u32,              // parent PID
    pub user: String,           // resolved username or "uid:N"
    pub cpu_pct: Option<f64>,   // None on first cycle
    pub mem_rss: u64,           // bytes (rss × page_size via sysconf)
    pub mem_pct: f64,           // rss / total_mem × 100
    pub mem_virt: u64,          // bytes (vsize)
    pub num_threads: u32,
    pub uptime: u64,            // seconds since process start
    pub majflt_rate: Option<f64>,  // major faults/sec, None on first cycle
    #[serde(skip_serializing_if = "Option::is_none")]
    pub io_read_rate: Option<f64>,   // bytes/sec, None if no permission
    #[serde(skip_serializing_if = "Option::is_none")]
    pub io_write_rate: Option<f64>,  // bytes/sec, None if no permission
    pub processor: i32,         // last CPU core
}
```

在 `MetricsPayload` 中添加：

```rust
pub struct MetricsPayload {
    // ... existing 97 fields ...
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_processes: Option<Vec<TopProcess>>,
}
```

### 5.2 Shared TypeScript Types (`packages/shared/src/metrics.ts`)

```typescript
export interface TopProcess {
  pid: number;
  name: string;
  cmd: string;
  state: string;
  ppid: number;
  user: string;
  cpu_pct: number | null;
  mem_rss: number;
  mem_pct: number;
  mem_virt: number;
  num_threads: number;
  uptime: number;
  majflt_rate: number | null;
  io_read_rate?: number | null;
  io_write_rate?: number | null;
  processor: number;
}

export interface MetricsPayload {
  // ... existing ...
  top_processes?: TopProcess[];
}
```

### 5.3 D1 Storage

**新增 1 个 TEXT 列**（和 `disk_json`、`net_json`、`disk_io_json` 模式一致）：

```sql
-- 0015_top_processes.sql
ALTER TABLE metrics_raw ADD COLUMN top_processes_json TEXT;
```

**D1 列数验证**：当前 `metrics_raw` = 98 列（含 id），INSERT 用 97 个参数。加 1 列 = 99 列 / 98 参数。D1 limit = 100 列，**还有 1 列余量**。

**不参与 hourly 聚合**：进程快照不适合 avg/max，`metrics_hourly` 查询时返回 `NULL`。

### 5.4 API Response (`packages/shared/src/api.ts`)

```typescript
export interface MetricsDataPoint {
  // ... existing ...
  top_processes_json: string | null;
}
```

---

## 6. Dashboard UI

### 6.1 Layout: Host Detail Page

在 **左栏 Metrics 区域最底部**（TCP Chart 下方）放置 Top Processes 表格。

```
┌── LEFT (3fr) ──────────────────┐
│  CPU Chart                     │
│  Memory Chart                  │
│  Network Chart                 │
│  PSI Chart                     │
│  Disk I/O Chart                │
│  TCP Chart                     │
│  ┌───────────────────────────┐ │
│  │  Top Processes Table      │ │  ← NEW
│  │  (latest snapshot)        │ │
│  └───────────────────────────┘ │
└────────────────────────────────┘
```

**为什么放左栏**：进程表格是宽数据（多列），需要 3fr 的宽度空间。且它是 metrics 数据的一部分，和其他 chart 同类。

**为什么不用折线图**：进程是离散快照数据，不适合 time-series 可视化。表格是最自然的展示形式。

### 6.2 Table Columns

| Column | Width | Content | Default Sort |
|--------|-------|---------|-------------|
| PID | 60px | `pid` | — |
| Name | 120px | `name`（comm），hover tooltip 显示完整 `cmd` | — |
| User | 80px | `user` | — |
| State | 50px | State badge（见 6.4 着色规则） | — |
| CPU% | 70px | `cpu_pct`，右对齐，1 位小数 | **desc** (default) |
| Memory | 80px | `mem_rss`，human-readable (MB/GB) | — |
| Mem% | 60px | `mem_pct`，右对齐，1 位小数 | — |
| Threads | 60px | `num_threads` | — |
| I/O R | 70px | `io_read_rate`，human-readable/s，`—` if null | — |
| I/O W | 70px | `io_write_rate`，human-readable/s，`—` if null | — |
| Uptime | 80px | human-readable (2d 3h, 15m, etc.) | — |

**隐藏列（默认不展示，空间不够时省略）**：
- `mem_virt` — Virtual memory
- `ppid` — Parent PID
- `majflt_rate` — Major faults/sec
- `processor` — Last CPU core

### 6.3 Sorting & Filtering

**排序**：
- 点击列头切换排序（asc/desc toggle）
- 默认按 CPU% 降序
- 支持所有数值列排序：CPU%, Mem%, Memory, Threads, I/O R, I/O W, Uptime

**过滤**：
- **搜索框**（表格上方）：按 name / cmd / user 文本过滤
- **State 过滤**：多选 chip（All / R / S / D / Z），默认 All
- **User 过滤**：dropdown，从当前数据中提取 unique users

### 6.4 Color Coding & Anomaly Highlighting

#### Process State Badges

| State | Label | Color | CSS |
|-------|-------|-------|-----|
| R | Running | `success` (green) | `bg-success/10 text-success` |
| S | Sleeping | `muted` (gray) | `bg-muted text-muted-foreground` |
| D | Disk Sleep | `warning` (amber) | `bg-warning/10 text-warning` |
| Z | Zombie | `destructive` (red) | `bg-destructive/10 text-destructive` |
| T | Stopped | `purple` | `bg-purple/10 text-purple` |

#### Row-Level Anomaly Highlighting

整行背景着色（subtle），当进程触发以下条件：

| Condition | Row Background | Meaning |
|-----------|---------------|---------|
| `cpu_pct > 80` | `bg-destructive/5` (faint red) | CPU hog |
| `cpu_pct > 50` | `bg-warning/5` (faint amber) | High CPU |
| `mem_pct > 30` | `bg-destructive/5` (faint red) | Memory hog |
| `mem_pct > 15` | `bg-warning/5` (faint amber) | High memory |
| `state == "D"` | `bg-warning/5` (faint amber) | Uninterruptible I/O wait |
| `state == "Z"` | `bg-destructive/5` (faint red) | Zombie process |
| `num_threads > 100` | `bg-warning/5` (faint amber) | Thread count anomaly |

**优先级**：destructive > warning > none。一行只显示最高优先级的颜色。

#### Cell-Level Value Coloring

数值列根据阈值着色（仅文字颜色）：

| Column | Normal | Warning | Critical |
|--------|--------|---------|----------|
| CPU% | `text-foreground` | `text-warning` (>50%) | `text-destructive` (>80%) |
| Mem% | `text-foreground` | `text-warning` (>15%) | `text-destructive` (>30%) |
| Threads | `text-foreground` | `text-warning` (>50) | `text-destructive` (>100) |
| State D | — | `text-warning` | — |
| State Z | — | — | `text-destructive` |

### 6.5 Empty & Loading States

| State | Display |
|-------|---------|
| Loading | Skeleton rows (5 rows × all columns) |
| No data (hourly resolution / timeRange > 24h) | "Process data is only available in real-time view (≤24h range)" |
| First cycle (all cpu_pct null) | Show table, CPU% column displays `—` |
| Probe version too old (no top_processes_json) | "Process monitoring requires probe ≥ 0.8.0" |

### 6.6 Data Source

- 只展示 **最近一个数据点** 的进程列表（不做时间序列回放）
- 从 `useHostMetrics` hook 获取 `metrics.data` 数组，取最后一个有 `top_processes_json` 的条目
- Parse JSON：`JSON.parse(point.top_processes_json)` → `TopProcess[]`
- SWR 60s 自动刷新（和其他 chart 一致）

---

## 7. Alerting

### 7.1 不添加系统级 alert rules

Top processes 是**诊断辅助数据**，不是独立告警信号。原因：
- 系统级 CPU/Memory 告警已由 `cpu_usage_pct`、`mem_used_pct` 等 T1 指标覆盖
- 进程级告警的 false positive 率高（短暂编译任务、备份任务正常占高 CPU）
- 正确的使用方式：系统级告警触发 → 查看 Top Processes 表格定位根因

### 7.2 Dashboard visual alerts（前端着色）

上述 6.4 中的 row/cell 着色即为视觉告警，不写入 `alert_states` 表，纯前端计算。

---

## 8. Atomic Commits

按依赖关系排列，每个 commit 独立可构建、可测试。

| # | Commit | Files | Test |
|---|--------|-------|------|
| 1 | `feat: add top_processes collector (probe)` | `probe/src/collectors/top_processes.rs`, `probe/src/collectors/mod.rs` | `cargo test` — parse unit tests with sample `/proc/[pid]/stat` data |
| 2 | `feat: add TopProcess to payload and orchestrate (probe)` | `probe/src/payload.rs`, `probe/src/orchestrate.rs` | `cargo test` — serialization round-trip |
| 3 | `feat: wire top_processes into main loop (probe)` | `probe/src/main.rs` | `cargo test` — integration (mock procfs dir) |
| 4 | `feat: add TopProcess shared types` | `packages/shared/src/metrics.ts`, `packages/shared/src/api.ts` | `bun test` — type compilation check |
| 5 | `feat: add D1 migration for top_processes_json` | `packages/worker/migrations/0015_top_processes.sql`, `packages/worker/test/e2e/wrangler.test.ts`, `packages/worker/src/test-helpers/mock-d1.ts` | `bun test` — E2E migration list sync + mock-d1 loads 0015 |
| 6 | `feat: ingest and store top_processes_json (worker)` | `packages/worker/src/services/metrics.ts` | `bun test` — E2E ingest with/without top_processes |
| 7 | `feat: return top_processes_json in metrics read (worker)` | `packages/worker/src/routes/metrics.ts` | `bun test` — E2E metrics endpoint returns new field |
| 8 | `feat: add TopProcessesTable component (dashboard)` | `packages/dashboard/src/components/charts/top-processes-table.tsx`, `packages/dashboard/src/lib/transforms.ts` | `bun test` — transform function unit tests |
| 9 | `feat: integrate TopProcessesTable into host detail page` | `packages/dashboard/src/app/hosts/[id]/page.tsx` | Manual visual verification + existing E2E |

---

## 9. Testing

### 9.1 L1 — Unit Tests

| Layer | File | Tests |
|-------|------|-------|
| Probe collector | `top_processes.rs` | `parse_proc_stat()` with real /proc/[pid]/stat samples; PID 复用检测 via starttime; cmdline truncation; io parse with/without permission; UID→username resolution |
| Probe orchestrate | `orchestrate.rs` | CPU% delta calculation accuracy; first-cycle null handling; disappeared-process cleanup |
| Shared types | `metrics.ts` | Type compilation（TS 编译即验证） |
| Dashboard transform | `transforms.ts` | `transformTopProcessesData()` — sort, filter, null handling, empty state |

**Coverage target**: Probe collector ≥ 90%, Dashboard transform ≥ 90%

### 9.2 L2 — Lint

- `cargo clippy` (probe) — 0 warnings
- `bun lint` (worker + dashboard) — 0 warnings

### 9.3 L3 — API E2E

| Test | Assertion |
|------|-----------|
| POST /api/ingest with top_processes | 204, data stored in D1 |
| POST /api/ingest without top_processes (backward compat) | 204, `top_processes_json = NULL` |
| GET /api/hosts/:id/metrics (raw range) | Response includes `top_processes_json` |
| GET /api/hosts/:id/metrics (hourly range) | Response has `top_processes_json: null` |

### 9.4 L4 — BDD E2E

不适用。进程数据无法在 CI 环境可靠模拟。

---

## 10. File Change Summary

### New Files (3)

| File | Description |
|------|-------------|
| `probe/src/collectors/top_processes.rs` | procfs 采集逻辑 — parse stat/cmdline/io, two-phase scan |
| `packages/worker/migrations/0015_top_processes.sql` | `ALTER TABLE metrics_raw ADD COLUMN top_processes_json TEXT` |
| `packages/dashboard/src/components/charts/top-processes-table.tsx` | Table component with sort/filter/color |

### Modified Files (11)

| File | Change |
|------|--------|
| `probe/src/collectors/mod.rs` | Add `pub mod top_processes` |
| `probe/src/payload.rs` | Add `TopProcess` struct + `MetricsPayload.top_processes` field |
| `probe/src/orchestrate.rs` | Add `build_top_processes()` function, modify `build_metrics_payload()` signature |
| `probe/src/main.rs` | Wire collector into `collect_metrics()`, manage prev-state HashMap |
| `packages/shared/src/metrics.ts` | Add `TopProcess` interface + `MetricsPayload.top_processes` |
| `packages/shared/src/index.ts` | Barrel export `TopProcess` type |
| `packages/shared/src/api.ts` | Add `MetricsDataPoint.top_processes_json` |
| `packages/worker/src/services/metrics.ts` | `insertMetricsRaw()` — add column + bind parameter (97→98) |
| `packages/worker/src/test-helpers/mock-d1.ts` | Load `0015_top_processes.sql` migration in mock DB setup |
| `packages/worker/src/routes/metrics.ts` | SELECT 加 `top_processes_json` |
| `packages/dashboard/src/app/hosts/[id]/page.tsx` | Import and render `TopProcessesTable` |

### Unchanged (no modification needed)

| File | Reason |
|------|--------|
| `packages/worker/src/routes/ingest.ts` | Optional field, no validation needed |
| `packages/worker/src/services/aggregation.ts` | Snapshot data, not aggregated to hourly |
| `packages/worker/src/services/alerts.ts` | No new alert rules (see §7) |

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| D1 100-column limit | 当前 98 列 + 1 = 99, 仅剩 1 列余量 | 未来新指标必须使用 `ext_json` 打包模式 |
| `/proc/[pid]/io` 默认弱可用（见 §2.7） | 非 root 运行的 probe 仅能采集自有进程 I/O | Graceful degradation: `io_read_rate: null`；可通过 `setcap cap_sys_ptrace+ep` 提权 |
| PID 复用（short-lived processes） | CPU% 计算错误 | `starttime` 校验，不匹配则重置 delta |
| Payload 膨胀（50 processes × 250B） | 12.5KB/request | 可接受；若需进一步压缩，减少到 Top 20 |
| Hourly 聚合无进程数据 | >24h 时间范围无进程表格 | UI 提示 "仅在实时视图（≤24h）中可用"；阈值与 `AUTO_RESOLUTION_THRESHOLD_SECONDS = 86400` 一致 |
| 进程扫描的 race condition | `/proc/[pid]/` 在读取过程中消失 | 每个 read 操作 catch ENOENT/EPERM，skip |
