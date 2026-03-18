# 01 — Metrics Catalogue

> Complete catalogue of all signals the bat probe collects.
> This document is the **authoritative reference** for signal names, sources, frequency, and status.
>
> Design principle: **once a file is open, extract every useful field** — the marginal parse cost is zero.
>
> Related documents:
> - [02-architecture.md](./02-architecture.md) — System overview
> - [03-data-structures.md](./03-data-structures.md) — Payload types, D1 schema, alert rules
> - [04-probe.md](./04-probe.md) — Probe implementation (collectors)
> - [09-tier3-signals.md](./09-tier3-signals.md) — T3 signal design rationale (historical)
> - [10-host-inventory.md](./10-host-inventory.md) — Host inventory design rationale (historical)

---

## Signal Architecture

Three collection cadences, three dedicated endpoints:

| Cadence | Default | Endpoint | Nature |
|---------|---------|----------|--------|
| **Real-time** | 30s (`interval`, min 10s) | `POST /api/ingest` | procfs/sysfs reads, zero fork |
| **Identity** | 6h | `POST /api/identity` | procfs/sysfs reads, +HTTP for public IP |
| **Slow scan** | 6h | `POST /api/tier2` | procfs reads + subprocess commands |

Identity and slow scan share the 6h cadence but tick independently. Both fire on startup, then every 6 hours.

<!-- Historical note: docs/01 previously described a unified POST /api/heartbeat and a configurable slow_interval.
     That merge is deferred; the current implementation uses 3 separate endpoints. -->

---

## Fleet Context

Design driven by real-world audit of 6 VPS hosts and Netdata comparison on jp.nocoo.cloud (1003 charts, 237 MB RSS).

| Host | Spec | OS | Role |
|------|------|----|------|
| jp.nocoo.cloud | 1C/1G | Debian 12 | frp relay + monitoring |
| us.nocoo.cloud | 3C/3.3G | Debian 12 | Uptime Kuma + GOST proxy |
| us2.nocoo.cloud | 2C/2.4G | Ubuntu 24.04 | Xray proxy |
| blog.nocoo.cloud | 1C/1.8G | Ubuntu 22.04 | LEMP blog (Nginx+PHP+MySQL+Redis) |
| docker.nocoo.cloud | 2C/3.8G | Ubuntu 24.04 | Caddy + n8n + Portainer + Watchtower |
| tongji.nocoo.cloud | 1C/1.9G | Ubuntu 20.04 | Nginx + PHP + MySQL + Outline VPN |

---

## Real-Time Signals (every 30s)

All from procfs/sysfs virtual file reads, < 1ms combined per tick.

### `/proc/stat` — CPU + System Activity

One file read. Already open for CPU jiffies — extract everything.

| Signal | Type | Unit | Parse | Status |
|--------|------|------|-------|--------|
| `cpu.usage_pct` | gauge | % | delta (user+nice+system) / total × 100 | ✅ |
| `cpu.iowait_pct` | gauge | % | delta iowait / total × 100 | ✅ |
| `cpu.steal_pct` | gauge | % | delta steal / total × 100 | ✅ |
| `cpu.context_switches_sec` | rate | /sec | `ctxt` line, delta / elapsed | ✅ |
| `cpu.forks_sec` | rate | /sec | `processes` line, delta / elapsed | ✅ |
| `cpu.procs_running` | gauge | count | `procs_running` line | ✅ |
| `cpu.procs_blocked` | gauge | count | `procs_blocked` line | ✅ |
| `cpu.interrupts_sec` | rate | /sec | `intr` line first field (total), delta / elapsed | ✅ |
| `cpu.softirq_net_rx_sec` | rate | /sec | `softirq` line field 5 (NET_RX), delta / elapsed | ✅ |
| `cpu.softirq_block_sec` | rate | /sec | `softirq` line field 6 (BLOCK), delta / elapsed | ✅ |

**Implementation**: `collectors/cpu.rs`.

**Rationale for new fields**: interrupt total rate detects IRQ storms; NET_RX softirq correlates with packet floods; BLOCK softirq correlates with disk I/O latency spikes. All extractable from the same `read()` at zero cost.

### `/proc/loadavg` — Load Average + Task Count

One file read. 5 fields in a single line — extract all useful ones.

| Signal | Type | Unit | Parse | Status |
|--------|------|------|-------|--------|
| `cpu.load1` | gauge | float | field 0 | ✅ |
| `cpu.load5` | gauge | float | field 1 | ✅ |
| `cpu.load15` | gauge | float | field 2 | ✅ |
| `cpu.tasks_running` | gauge | count | field 3 numerator (before `/`) | ✅ |
| `cpu.tasks_total` | gauge | count | field 3 denominator (after `/`) | ✅ |

**Rationale**: `tasks_total` is the cheapest thread count available — no `/proc/[pid]` walk needed.

### `/proc/meminfo` — Memory Composition

One file read (~50 lines). Currently extracting 4 fields out of ~50 — expand to cover full memory landscape.

| Signal | Type | Unit | Parse | Status |
|--------|------|------|-------|--------|
| `mem.total_bytes` | gauge | bytes | MemTotal × 1024 | ✅ |
| `mem.available_bytes` | gauge | bytes | MemAvailable × 1024 | ✅ |
| `mem.used_pct` | gauge | % | (total - available) / total × 100 | ✅ |
| `mem.buffers_bytes` | gauge | bytes | Buffers × 1024 | ✅ |
| `mem.cached_bytes` | gauge | bytes | Cached × 1024 | ✅ |
| `mem.dirty_bytes` | gauge | bytes | Dirty × 1024 | ✅ |
| `mem.writeback_bytes` | gauge | bytes | Writeback × 1024 | ✅ |
| `mem.shmem_bytes` | gauge | bytes | Shmem × 1024 | ✅ |
| `mem.slab_reclaimable_bytes` | gauge | bytes | SReclaimable × 1024 | ✅ |
| `mem.slab_unreclaim_bytes` | gauge | bytes | SUnreclaim × 1024 | ✅ |
| `mem.committed_as_bytes` | gauge | bytes | Committed_AS × 1024 | ✅ |
| `mem.commit_limit_bytes` | gauge | bytes | CommitLimit × 1024 | ✅ |
| `mem.hardware_corrupted_bytes` | gauge | bytes | HardwareCorrupted × 1024 | ✅ |
| `swap.total_bytes` | gauge | bytes | SwapTotal × 1024 | ✅ |
| `swap.used_bytes` | gauge | bytes | (SwapTotal - SwapFree) × 1024 | ✅ |
| `swap.used_pct` | gauge | % | used / total × 100 | ✅ |

**Rationale for new fields**:
- `cached` — page cache shrinking toward 0 means memory pressure, even before OOM. tongji had committed 3175 MB on 1.9 GB RAM.
- `dirty` + `writeback` — write pressure; dirty pages spiking precedes iowait spikes.
- `slab_unreclaim` — growth here = kernel memory leak (dentry/inode cache).
- `committed_as` + `commit_limit` — overcommit ratio; tongji was at 167%.
- `hardware_corrupted` — alert if > 0, indicates failing RAM.

### `/proc/vmstat` — VM Subsystem Counters

One file read. Currently extracting only `oom_kill` — expand to cover swap I/O and page fault counters.

| Signal | Type | Unit | Parse | Status |
|--------|------|------|-------|--------|
| `mem.oom_kills_delta` | counter | count | `oom_kill` line, delta | ✅ |
| `mem.swap_in_sec` | rate | pages/sec | `pswpin` line, delta / elapsed | ✅ |
| `mem.swap_out_sec` | rate | pages/sec | `pswpout` line, delta / elapsed | ✅ |
| `mem.pgmajfault_sec` | rate | faults/sec | `pgmajfault` line, delta / elapsed | ✅ |
| `mem.pgpgin_sec` | rate | KB/sec | `pgpgin` line, delta / elapsed | ✅ |
| `mem.pgpgout_sec` | rate | KB/sec | `pgpgout` line, delta / elapsed | ✅ |

**Rationale**: `pswpin/pswpout` is the #1 swap activity indicator — even 1 swap-out/s matters on a small VPS. `pgmajfault` measures stalls waiting for disk I/O to service page faults. All deltas from the same file already in memory.

### `/proc/diskstats` — Disk I/O

One file read. Currently extracting 5 fields per device — expand to include latency and queue depth.

| Signal | Type | Unit | Parse | Status |
|--------|------|------|-------|--------|
| `disk_io[].device` | label | string | field 2 | ✅ |
| `disk_io[].read_iops` | rate | ops/sec | reads_completed delta / elapsed | ✅ |
| `disk_io[].write_iops` | rate | ops/sec | writes_completed delta / elapsed | ✅ |
| `disk_io[].read_bytes_sec` | rate | bytes/sec | sectors_read × 512 delta / elapsed | ✅ |
| `disk_io[].write_bytes_sec` | rate | bytes/sec | sectors_written × 512 delta / elapsed | ✅ |
| `disk_io[].io_util_pct` | gauge | % | io_ms delta / elapsed_ms × 100 (cap 100) | ✅ |
| `disk_io[].read_await_ms` | gauge | ms | read_ms delta / reads delta (0 if no reads) | ✅ |
| `disk_io[].write_await_ms` | gauge | ms | write_ms delta / writes delta (0 if no writes) | ✅ |
| `disk_io[].io_queue_depth` | gauge | count | io_in_progress (instant, no delta) | ✅ |

**Fields from `/proc/diskstats`** (0-indexed after name): 0=reads, 1=reads_merged, 2=sectors_read, **3=read_ms**, 4=writes, 5=writes_merged, 6=sectors_written, **7=write_ms**, **8=io_in_progress**, 9=io_ms, 10=io_ms_weighted.

**Rationale**: latency (await) is the most user-visible disk metric — a disk can show 0% utilization yet have 50ms latency. Queue depth > 1 means active congestion. Both fields already in memory from the same read.

### `/sys/class/net/*/statistics/` — Network

4 → 8 file reads per interface. Same directory, same pattern.

| Signal | Type | Unit | Parse | Status |
|--------|------|------|-------|--------|
| `net[].iface` | label | string | directory name | ✅ |
| `net[].rx_bytes_rate` | rate | bytes/sec | `rx_bytes` delta / elapsed | ✅ |
| `net[].tx_bytes_rate` | rate | bytes/sec | `tx_bytes` delta / elapsed | ✅ |
| `net[].rx_errors` | counter | count | `rx_errors` delta | ✅ |
| `net[].tx_errors` | counter | count | `tx_errors` delta | ✅ |
| `net[].rx_packets_rate` | rate | pkts/sec | `rx_packets` delta / elapsed | ✅ |
| `net[].tx_packets_rate` | rate | pkts/sec | `tx_packets` delta / elapsed | ✅ |
| `net[].rx_dropped` | counter | count | `rx_dropped` delta | ✅ |
| `net[].tx_dropped` | counter | count | `tx_dropped` delta | ✅ |

**Rationale**: packet rate + byte rate → average packet size (workload type indicator). `rx_dropped` is packet loss at the NIC/kernel level — the root cause of mysterious connection timeouts. 4 extra sysfs reads per interface, same pattern as existing reads.

### `/proc/pressure/{cpu,memory,io}` — PSI

3 file reads. Currently extracting 15 avg values — add 6 `total` counters for precise stall measurement.

| Signal | Type | Unit | Parse | Status |
|--------|------|------|-------|--------|
| `psi.cpu_some_avg10/60/300` | gauge | % | `some` line avg fields | ✅ |
| `psi.mem_some_avg10/60/300` | gauge | % | `some` line avg fields | ✅ |
| `psi.mem_full_avg10/60/300` | gauge | % | `full` line avg fields | ✅ |
| `psi.io_some_avg10/60/300` | gauge | % | `some` line avg fields | ✅ |
| `psi.io_full_avg10/60/300` | gauge | % | `full` line avg fields | ✅ |
| `psi.cpu_some_total_delta` | counter | μs | `some` line `total=`, delta | ✅ |
| `psi.mem_some_total_delta` | counter | μs | `some` line `total=`, delta | ✅ |
| `psi.mem_full_total_delta` | counter | μs | `full` line `total=`, delta | ✅ |
| `psi.io_some_total_delta` | counter | μs | `some` line `total=`, delta | ✅ |
| `psi.io_full_total_delta` | counter | μs | `full` line `total=`, delta | ✅ |

**Rationale**: `total` is a monotonic μs counter; delta / interval gives exact stall fraction per collection period, more precise than kernel-smoothed avg10/60/300 which can mask short spikes. Note: cpu only has `some`, no `full` — 5 new deltas, not 6.

Requires kernel ≥ 4.20 with `CONFIG_PSI=y`. Entire PSI section is `None` if any of the 3 files is missing.

### `/proc/net/sockstat` — Socket State

One file read. Currently extracting 4 TCP fields — expand to full socket inventory.

| Signal | Type | Unit | Parse | Status |
|--------|------|------|-------|--------|
| `tcp.established` | gauge | count | `TCP: inuse` | ✅ |
| `tcp.time_wait` | gauge | count | `TCP: tw` | ✅ |
| `tcp.orphan` | gauge | count | `TCP: orphan` | ✅ |
| `tcp.allocated` | gauge | count | `TCP: alloc` | ✅ |
| `tcp.mem_pages` | gauge | pages | `TCP: mem` | ✅ |
| `sockets.used` | gauge | count | `sockets: used` | ✅ |
| `udp.inuse` | gauge | count | `UDP: inuse` | ✅ |
| `udp.mem_pages` | gauge | pages | `UDP: mem` | ✅ |

**Rationale**: TCP mem pages approaching kernel limit = TCP memory pressure. `sockets.used` is the cheapest total-socket gauge. UDP inuse matters for DNS-heavy or game servers.

### `/proc/net/snmp` — TCP/UDP Protocol Counters

**New file, +1 read.** Two-line format: header row + values row, repeated per protocol. Parse `Tcp:` and `Udp:` sections.

| Signal | Type | Unit | Parse | Status |
|--------|------|------|-------|--------|
| `tcp.retrans_segs_sec` | rate | segs/sec | `RetransSegs` delta / elapsed | ✅ |
| `tcp.active_opens_sec` | rate | conn/sec | `ActiveOpens` delta / elapsed | ✅ |
| `tcp.passive_opens_sec` | rate | conn/sec | `PassiveOpens` delta / elapsed | ✅ |
| `tcp.attempt_fails_sec` | rate | fails/sec | `AttemptFails` delta / elapsed | ✅ |
| `tcp.estab_resets_sec` | rate | resets/sec | `EstabResets` delta / elapsed | ✅ |
| `tcp.in_errs` | counter | count | `InErrs` delta | ✅ |
| `tcp.out_rsts_sec` | rate | resets/sec | `OutRsts` delta / elapsed | ✅ |
| `udp.rcvbuf_errors` | counter | count | `RcvbufErrors` delta | ✅ |
| `udp.sndbuf_errors` | counter | count | `SndbufErrors` delta | ✅ |
| `udp.in_errors` | counter | count | `InErrors` delta | ✅ |

**Rationale**: This is the single highest-value new file. tongji showed 65 SYN retransmits/sec peak — completely invisible to current bat. `RetransSegs` is the #1 network quality indicator. `ActiveOpens/PassiveOpens` give connection rate. `AttemptFails` detects unreachable remote services. `EstabResets` detects abrupt disconnections.

### `/proc/net/netstat` — Extended TCP Statistics

**New file, +1 read.** Same two-line format. Parse `TcpExt:` section.

| Signal | Type | Unit | Parse | Status |
|--------|------|------|-------|--------|
| `tcp.listen_overflows` | counter | count | `ListenOverflows` delta | ✅ |
| `tcp.listen_drops` | counter | count | `ListenDrops` delta | ✅ |
| `tcp.timeouts` | counter | count | `TCPTimeouts` delta | ✅ |
| `tcp.syn_retrans` | counter | count | `TCPSynRetrans` delta | ✅ |
| `tcp.fast_retrans` | counter | count | `TCPFastRetrans` delta | ✅ |
| `tcp.ofo_queue` | counter | count | `TCPOFOQueue` delta | ✅ |
| `tcp.abort_on_memory` | counter | count | `TCPAbortOnMemory` delta | ✅ |
| `tcp.syncookies_sent` | counter | count | `SyncookiesSent` delta | ✅ |

**Rationale**: `ListenOverflows` = connections dropped because accept backlog was full — the most direct server capacity saturation signal. `TCPTimeouts` + `TCPSynRetrans` decompose retransmit causes. `SyncookiesSent` > 0 means a SYN flood is happening. `TCPAbortOnMemory` = connections killed due to memory pressure.

### `/proc/net/softnet_stat` — Network Processing

**New file, +1 read.** One line per CPU, hex fields. Aggregate across CPUs.

| Signal | Type | Unit | Parse | Status |
|--------|------|------|-------|--------|
| `softnet.processed` | counter | pkts | col 0, sum across CPUs, delta | ✅ |
| `softnet.dropped` | counter | pkts | col 1, sum across CPUs, delta | ✅ |
| `softnet.time_squeeze` | counter | count | col 2, sum across CPUs, delta | ✅ |

**Rationale**: `dropped` = kernel could not process incoming packets fast enough — the root cause of unexplained NIC-level packet loss that shows up as connection timeouts in applications. `time_squeeze` = CPU budget exhausted during softirq processing. blog.nocoo.cloud showed non-zero `squeezed`.

### `statvfs()` — Disk Space + Inodes

One syscall per mount. Already called for space — add inode fields from the same return struct.

| Signal | Type | Unit | Parse | Status |
|--------|------|------|-------|--------|
| `disk[].mount` | label | string | mount point | ✅ |
| `disk[].total_bytes` | gauge | bytes | f_blocks × f_bsize | ✅ |
| `disk[].avail_bytes` | gauge | bytes | f_bavail × f_frsize | ✅ |
| `disk[].used_pct` | gauge | % | (total - avail) / total × 100 | ✅ |
| `disk[].inodes_total` | gauge | count | f_files | ✅ |
| `disk[].inodes_avail` | gauge | count | f_favail | ✅ |
| `disk[].inodes_used_pct` | gauge | % | (total - avail) / total × 100 | ✅ |

**Rationale**: Inode exhaustion is a common production outage — disk shows plenty of free space but `cannot create file: no space on device`. Zero additional I/O — `statvfs()` already returns these fields.

### `/proc/sys/fs/file-nr` — File Descriptors

One file read, unchanged.

| Signal | Type | Unit | Parse | Status |
|--------|------|------|-------|--------|
| `fd.allocated` | gauge | count | field 0 | ✅ |
| `fd.max` | gauge | count | field 2 | ✅ |

### `/proc/uptime` — Uptime

One file read, unchanged.

| Signal | Type | Unit | Parse | Status |
|--------|------|------|-------|--------|
| `uptime_seconds` | gauge | seconds | field 0, truncated to u64 | ✅ |

### `/proc/sys/net/netfilter/nf_conntrack_{count,max}` — Conntrack

**New, 2 file reads.** Single integer per file.

| Signal | Type | Unit | Parse | Status |
|--------|------|------|-------|--------|
| `conntrack.count` | gauge | count | `nf_conntrack_count` | ✅ |
| `conntrack.max` | gauge | count | `nf_conntrack_max` | ✅ |

**Rationale**: tongji had 936/65536 connections tracked; blog had 854. Conntrack table exhaustion drops all new connections — critical for any host running NAT, Docker, or iptables. 2 trivial file reads. `None` if netfilter not loaded.

---

### Real-Time Collection Cost Summary

| Source | Signals | Cost | Status |
|--------|---------|------|--------|
| `/proc/stat` | 10 (cpu + interrupts + softirq) | 1 read + delta | ✅ |
| `/proc/loadavg` | 5 (load + tasks) | 1 read | ✅ |
| `/proc/meminfo` | 16 (mem + swap composition) | 1 read | ✅ |
| `/proc/vmstat` | 6 (oom + swap I/O + pgfault) | 1 read + delta | ✅ |
| `/proc/diskstats` | 9 per device (IOPS + throughput + latency + queue) | 1 read + delta | ✅ |
| `/sys/class/net/*/statistics/` | 9 per iface (bytes + pkts + errors + drops) | 8 reads/iface | ✅ |
| `/proc/pressure/{cpu,memory,io}` | 20 (avg + total delta) | 3 reads | ✅ |
| `/proc/net/sockstat` | 8 (tcp + udp + sockets) | 1 read | ✅ |
| `/proc/net/snmp` | 10 (tcp retrans + conn rate + udp errs) | 1 read + delta | ✅ |
| `/proc/net/netstat` | 8 (listen drops + timeouts + retrans detail) | 1 read + delta | ✅ |
| `/proc/net/softnet_stat` | 3 (processed + dropped + squeeze) | 1 read + delta | ✅ |
| `statvfs()` | 7 per mount (space + inodes) | 1 syscall/mount | ✅ |
| `/proc/sys/fs/file-nr` | 2 (fd alloc + max) | 1 read | ✅ |
| `/proc/uptime` | 1 | 1 read | ✅ |
| `/proc/sys/net/netfilter/nf_conntrack_*` | 2 (count + max) | 2 reads | ✅ |

**Total: ~27 file reads + N×8 sysfs reads + N statvfs calls per tick** (up from ~22+N×4).
Netdata runs hundreds of collectors per tick consuming 237 MB RSS. Bat probe: ~5 MB RSS.

---

## Slow-Scan Signals (every 6h)

Collected at startup + every 6 hours via `POST /api/identity` (host identity) and `POST /api/tier2` (deep scans). Includes host identity (procfs/sysfs, cheap), slow-drift config files, and subprocess-based scans.

### Host Identity (procfs/sysfs reads, no fork)

| Signal | Type | Source | Status |
|--------|------|--------|--------|
| `host_id` | string | Config or `/etc/hostname` fallback | ✅ |
| `hostname` | string | `/etc/hostname` | ✅ |
| `os` | string | `/etc/os-release` PRETTY_NAME | ✅ |
| `kernel` | string | `/proc/version` | ✅ |
| `arch` | string | `uname -m` (libc) | ✅ |
| `cpu_model` | string | `/proc/cpuinfo` first `model name` | ✅ |
| `cpu_logical` | u32 | `/proc/cpuinfo` `^processor` count | ✅ |
| `cpu_physical` | u32 | `/proc/cpuinfo` unique (physical_id, core_id) pairs | ✅ |
| `mem_total_bytes` | u64 | `/proc/meminfo` MemTotal × 1024 | ✅ |
| `swap_total_bytes` | u64 | `/proc/meminfo` SwapTotal × 1024 | ✅ |
| `virtualization` | string | `/sys/class/dmi/id/sys_vendor` + `product_name` | ✅ |
| `net_interfaces[]` | array | `/sys/class/net/` + `address` + `speed` + `/proc/net/if_inet6` | ✅ |
| `disks[]` | array | `/sys/block/{dev}/size` + `queue/rotational` | ✅ |
| `boot_mode` | string | `/sys/firmware/efi` existence → "uefi"/"bios" | ✅ |
| `uptime_seconds` | u64 | `/proc/uptime` | ✅ |
| `boot_time` | u64 epoch | `now() - uptime` | ✅ |
| `probe_version` | string | `CARGO_PKG_VERSION` | ✅ |
| `public_ip` | string | `https://echo.nocoo.cloud/api/ip` (also refreshed every 1h) | ✅ |

Uses 2-state wire semantics: key present = update, key absent = retain.

### Slow-Drift Config Files (procfs/file reads, no fork)

| Signal | Type | Source | Status |
|--------|------|--------|--------|
| `timezone` | string | `/etc/timezone`, fallback `readlink /etc/localtime` | ✅ |
| `dns_resolvers[]` | array | `/etc/resolv.conf` `nameserver` lines | ✅ |
| `dns_search[]` | array | `/etc/resolv.conf` `search` line | ✅ |

Stored in `hosts` table (not snapshots) — these describe identity, not point-in-time state.

### Subprocess-Based Scans (fork + exec, background non-blocking)

#### Package Updates

| Signal | Type | Source | Status |
|--------|------|--------|--------|
| `updates.total_count` | u32 | `apt list --upgradable` | ✅ |
| `updates.security_count` | u32 | source contains "security" | ✅ |
| `updates.list[]` | array | name, current_version, new_version, is_security | ✅ |
| `updates.reboot_required` | bool | `/var/run/reboot-required` existence | ✅ |
| `updates.cache_age_seconds` | u64 | `/var/lib/apt/lists` mtime delta | ✅ |

Only when `apt` available (Debian/Ubuntu). Does NOT run `apt update`.

#### Disk Deep Scan

| Signal | Type | Source | Status |
|--------|------|--------|--------|
| `disk_deep.top_dirs[]` | array | `du -xb --max-depth=1 /` → top 10 | ✅ |
| `disk_deep.journal_bytes` | u64 | `journalctl --disk-usage` | ✅ |
| `disk_deep.large_files[]` | array | `find / -xdev -type f -size +100M` → top 20 | ✅ |

Three commands run concurrently.

#### Docker Status

| Signal | Type | Source | Status |
|--------|------|--------|--------|
| `docker.installed` | bool | `/var/run/docker.sock` existence | ✅ |
| `docker.version` | string | `docker version --format` | ✅ |
| `docker.containers[]` | array | `docker ps -a` + `stats` + `inspect` | ✅ |
| `docker.images` | object | `docker system df` (total_count, total_bytes, reclaimable_bytes) | ✅ |

Per container: id, name, image, status, state, cpu_pct, mem_bytes, restart_count, started_at.

#### Service Ports

| Signal | Type | Source | Status |
|--------|------|--------|--------|
| `ports.listening[]` | array | `/proc/net/tcp{,6}` state=0A + `/proc/*/fd/` inode mapping | ✅ |

Per port: port, bind, protocol, pid, process. Runs in `spawn_blocking`.

#### Security Posture

| Signal | Type | Source | Status |
|--------|------|--------|--------|
| `security.ssh_password_auth` | bool | `/etc/ssh/sshd_config` + `sshd_config.d/*.conf` | ✅ |
| `security.ssh_root_login` | string | same (yes/no/prohibit-password) | ✅ |
| `security.ssh_failed_logins_7d` | u64 | `journalctl -u ssh(d) --since "7 days ago"` | ✅ |
| `security.firewall_active` | bool | `ufw status` → `iptables -L INPUT -n` | ✅ |
| `security.firewall_default_policy` | string | same | ✅ |
| `security.fail2ban_active` | bool | `systemctl is-active fail2ban` | ✅ |
| `security.fail2ban_banned_count` | u32 | `fail2ban-client status sshd` | ✅ |
| `security.unattended_upgrades_active` | bool | `systemctl is-active unattended-upgrades` | ✅ |

All fields `Option` — omitted if tool not found.

#### Systemd Services

| Signal | Type | Source | Status |
|--------|------|--------|--------|
| `systemd.failed_count` | u32 | `systemctl list-units --state=failed` | ✅ |
| `systemd.failed[]` | array | unit, load_state, active_state, sub_state, description | ✅ |

Only `.service` units.

---

## Alert Rules (30 rules)

The probe reports raw numbers. Worker evaluates alerts server-side.

### Implemented (30 rules)

| # | Rule ID | Condition | Severity | Duration |
|---|---------|-----------|----------|----------|
| 1 | `mem_high` | `mem.used_pct > 85` AND `swap.used_pct > 50` | critical | instant |
| 2 | `no_swap` | `swap.total_bytes == 0` AND `mem.used_pct > 70` | critical | instant |
| 3 | `disk_full` | ANY `disk[].used_pct > 85` | critical | instant |
| 4 | `iowait_high` | `cpu.iowait_pct > 20` | warning | 5 min |
| 5 | `steal_high` | `cpu.steal_pct > 10` | warning | 5 min |
| 6 | `host_offline` | `last_seen > 120s` | critical | query-time |
| 7 | `uptime_anomaly` | `uptime_seconds < 300` | info | instant |
| 8 | `ssh_password_auth` | `security.ssh_password_auth == true` | critical | instant |
| 9 | `ssh_root_login` | `security.ssh_root_login == "yes"` | critical | instant |
| 10 | `no_firewall` | `security.firewall_active == false` | critical | instant |
| 11 | `public_port` | port on `0.0.0.0`/`::`, not in allowlist [22,80,443] | warning | instant |
| 12 | `security_updates` | `updates.security_count > 0` | warning | 7 days |
| 13 | `container_restart` | ANY `docker.containers[].restart_count > 5` | critical | instant |
| 14 | `systemd_failed` | `systemd.failed_count > 0` | warning | instant |
| 15 | `reboot_required` | `updates.reboot_required == true` | info | 7 days |
| 16 | `cpu_pressure` | `psi.cpu_some_avg60 > 25` | warning | 5 min |
| 17 | `mem_pressure` | `psi.mem_some_avg60 > 10` | warning | 5 min |
| 18 | `io_pressure` | `psi.io_some_avg60 > 20` | warning | 5 min |
| 19 | `disk_io_saturated` | ANY `disk_io[].io_util_pct > 80` | warning | 5 min |
| 20 | `tcp_conn_leak` | `tcp.time_wait > 500` | warning | 5 min |
| 21 | `oom_kill` | `mem.oom_kills_delta > 0` | critical | instant |
| 22 | `tcp_retrans_high` | `snmp.retrans_segs_sec > 10` | warning | 5 min |
| 23 | `listen_drops` | `netstat.listen_drops_delta > 0` | critical | instant |
| 24 | `inode_full` | ANY `disk[].inodes_used_pct > 90` | critical | instant |
| 25 | `swap_active` | `mem.swap_in_sec + mem.swap_out_sec > 1` | warning | 5 min |
| 26 | `hw_corrupted` | `mem.hw_corrupted > 0` | critical | instant |
| 27 | `overcommit_high` | `mem.committed_as / mem.commit_limit > 1.5` | warning | instant |
| 28 | `conntrack_full` | `conntrack.count / conntrack.max > 0.8` | critical | instant |
| 29 | `softnet_drops` | `softnet.dropped_delta > 0` | warning | instant |
| 30 | `disk_latency_high` | ANY `disk_io[].read_await_ms > 100` OR `write_await_ms > 200` | warning | 5 min |

### Alert Evaluation Mechanics

- **Instant rules** (duration = 0): Fired → UPSERT `alert_states`. Not fired → DELETE. Self-healing.
- **Duration rules** (duration > 0): First fire → INSERT `alert_pending`. Sustained ≥ duration → promote to `alert_states`. Clears → DELETE from both.
- **Host status**: offline (>120s) > critical > warning > healthy. `info` does NOT affect status.

---

## Data Retention

| Table | Retention | Aggregation |
|-------|-----------|-------------|
| `metrics_raw` | 7 days | None (raw samples) |
| `metrics_hourly` | 90 days | Cron: avg/max/min/sum per hour |
| `slow_scan_snapshots` | 90 days | None (6h snapshots) |

---

## Resource Budget

| Resource | v0.5.2 (with signal expansion) | Netdata |
|----------|-------------------------------|---------|
| RSS | ~6 MB | 120-243 MB |
| CPU (idle) | < 0.05% | 1-3% |
| Binary size | ~3.5 MB (unstripped) | 200+ MB |
| Payload | ~1.8 KB/tick | 50+ KB/tick |
| File reads/tick | ~27 + 8N | Hundreds |
| Dependencies | 0 (static binary) | Python, Go, Node.js |
| Threads | 1 | 14+ |
| Disk writes | 0 bytes | Continuous DB writes |

Where N = number of network interfaces (typically 1-2).
