# 01 — Metrics Catalogue

> Complete catalogue of all signals the bat system collects, with procfs/sysfs sources, collection frequency, and implementation status.
> This document is the **authoritative reference** — updated to match actual code as of v0.5.2.
>
> Related documents:
> - [02-architecture.md](./02-architecture.md) — System overview
> - [03-data-structures.md](./03-data-structures.md) — Payload types, D1 schema, alert rules
> - [04-probe.md](./04-probe.md) — Probe implementation (collectors)
> - [09-tier3-signals.md](./09-tier3-signals.md) — Tier 3 design rationale and gap analysis
> - [10-host-inventory.md](./10-host-inventory.md) — Host inventory design rationale

---

## Signal Architecture

Three collection tiers, three API endpoints, three cadences:

| Tier | Endpoint | Frequency | Nature |
|------|----------|-----------|--------|
| **T1 Metrics** | `POST /api/ingest` | Every 30s (configurable, min 10s) | High-frequency procfs/sysfs reads |
| **Identity** | `POST /api/identity` | Startup + every 6h | Static host attributes |
| **T2 Tier 2** | `POST /api/tier2` | Startup + every 6h (background, non-blocking) | Slow collectors: commands, file scans |

Additional: Public IP via `https://echo.nocoo.cloud/api/ip`, startup + every 1h.

---

## Fleet Context

Design driven by real-world audit of 6 VPS hosts on 2026-03-15.

| Host | Spec | OS | Role |
|------|------|----|------|
| jp.nocoo.cloud | 1C/1G | Debian 12 | frp relay + monitoring |
| us.nocoo.cloud | 3C/3.3G | Debian 12 | Uptime Kuma + GOST proxy |
| us2.nocoo.cloud | 2C/2.4G | Ubuntu 24.04 | Xray proxy |
| blog.nocoo.cloud | 1C/1.8G | Ubuntu 22.04 | LEMP blog (Nginx+PHP+MySQL+Redis) |
| docker.nocoo.cloud | 2C/3.8G | Ubuntu 24.04 | Caddy + n8n + Portainer + Watchtower |
| tongji.nocoo.cloud | 1C/1.9G | Ubuntu 20.04 | Nginx + PHP + MySQL + Outline VPN |

---

## Tier 1: Real-Time Metrics (every 30s)

Cheap procfs/sysfs reads, < 1ms each. Sent via `MetricsPayload` to `POST /api/ingest`.

### 1.1 CPU

| Metric | Type | Unit | Source | Status |
|--------|------|------|--------|--------|
| `cpu.usage_pct` | gauge | % | `/proc/stat` cpu line, delta (user+nice+system)/total × 100 | ✅ |
| `cpu.iowait_pct` | gauge | % | `/proc/stat` cpu line, delta iowait/total × 100 | ✅ |
| `cpu.steal_pct` | gauge | % | `/proc/stat` cpu line, delta steal/total × 100 | ✅ |
| `cpu.load1` | gauge | float | `/proc/loadavg` field 1 | ✅ |
| `cpu.load5` | gauge | float | `/proc/loadavg` field 2 | ✅ |
| `cpu.load15` | gauge | float | `/proc/loadavg` field 3 | ✅ |
| `cpu.count` | gauge | int | `/proc/cpuinfo` processor count | ✅ |
| `cpu.context_switches_sec` | gauge | /sec | `/proc/stat` `ctxt` line, delta/elapsed | ✅ T3 |
| `cpu.forks_sec` | gauge | /sec | `/proc/stat` `processes` line, delta/elapsed | ✅ T3 |
| `cpu.procs_running` | gauge | count | `/proc/stat` `procs_running` line | ✅ T3 |
| `cpu.procs_blocked` | gauge | count | `/proc/stat` `procs_blocked` line | ✅ T3 |

**Implementation**: `probe/src/collectors/cpu.rs`. Jiffies are read from `/proc/stat` `cpu ` aggregate line into `CpuJiffies` struct (user, nice, system, idle, iowait, irq, softirq, steal). Delta computation on the orchestrate layer. T3 fields (context_switches_sec, forks_sec, procs_running, procs_blocked) extracted from the same `/proc/stat` read — zero additional I/O.

### 1.2 Memory

| Metric | Type | Unit | Source | Status |
|--------|------|------|--------|--------|
| `mem.total_bytes` | gauge | bytes | `/proc/meminfo` MemTotal × 1024 | ✅ |
| `mem.available_bytes` | gauge | bytes | `/proc/meminfo` MemAvailable × 1024 | ✅ |
| `mem.used_pct` | gauge | % | `(total - available) / total × 100` | ✅ |
| `mem.oom_kills_delta` | gauge | count | `/proc/vmstat` `oom_kill` line, delta (saturating) | ✅ T3 |
| `swap.total_bytes` | gauge | bytes | `/proc/meminfo` SwapTotal × 1024 | ✅ |
| `swap.used_bytes` | gauge | bytes | `/proc/meminfo` (SwapTotal - SwapFree) × 1024 | ✅ |
| `swap.used_pct` | gauge | % | `used / total × 100` (0 if no swap) | ✅ |

**Implementation**: `probe/src/collectors/memory.rs`. OOM kills from `/proc/vmstat` require kernel ≥ 4.13; emits `None` on older kernels.

### 1.3 Disk Space

| Metric | Type | Unit | Source | Status |
|--------|------|------|--------|--------|
| `disk[].mount` | label | string | `/proc/mounts` | ✅ |
| `disk[].total_bytes` | gauge | bytes | `statvfs()` blocks × block_size | ✅ |
| `disk[].avail_bytes` | gauge | bytes | `statvfs()` f_bavail × f_frsize | ✅ |
| `disk[].used_pct` | gauge | % | `(total - avail) / total × 100` | ✅ |

**Implementation**: `probe/src/collectors/disk.rs`. Mount discovery from `/proc/mounts`, filtered to real filesystems (ext4, xfs, btrfs, overlay, zfs, f2fs). Configurable exclude mounts and fs types.

### 1.4 Disk I/O (T3)

| Metric | Type | Unit | Source | Status |
|--------|------|------|--------|--------|
| `disk_io[].device` | label | string | `/proc/diskstats` field 2 | ✅ T3 |
| `disk_io[].read_iops` | gauge | ops/sec | `/proc/diskstats` reads_completed delta/elapsed | ✅ T3 |
| `disk_io[].write_iops` | gauge | ops/sec | `/proc/diskstats` writes_completed delta/elapsed | ✅ T3 |
| `disk_io[].read_bytes_sec` | gauge | bytes/sec | `/proc/diskstats` sectors_read × 512 delta/elapsed | ✅ T3 |
| `disk_io[].write_bytes_sec` | gauge | bytes/sec | `/proc/diskstats` sectors_written × 512 delta/elapsed | ✅ T3 |
| `disk_io[].io_util_pct` | gauge | % | `/proc/diskstats` io_ms delta/elapsed_ms × 100 (capped 100) | ✅ T3 |

**Implementation**: `probe/src/collectors/disk_io.rs`. Filters: exclude `loop*`, `ram*`, partitions (`sda1`, `nvme0n1p1`), `dm-*` with zero I/O. Keeps whole block devices only.

### 1.5 Network

| Metric | Type | Unit | Source | Status |
|--------|------|------|--------|--------|
| `net[].iface` | label | string | `/sys/class/net/` directory listing | ✅ |
| `net[].rx_bytes_rate` | gauge | bytes/sec | `/sys/class/net/{iface}/statistics/rx_bytes` delta/elapsed | ✅ |
| `net[].tx_bytes_rate` | gauge | bytes/sec | `/sys/class/net/{iface}/statistics/tx_bytes` delta/elapsed | ✅ |
| `net[].rx_errors` | gauge | count | `/sys/class/net/{iface}/statistics/rx_errors` delta | ✅ |
| `net[].tx_errors` | gauge | count | `/sys/class/net/{iface}/statistics/tx_errors` delta | ✅ |

**Implementation**: `probe/src/collectors/network.rs`. Interface discovery from `/sys/class/net/`. Configurable excludes (default: `lo`, `docker0`). u64 counter wrap handling.

### 1.6 PSI Pressure (T3)

| Metric | Type | Unit | Source | Status |
|--------|------|------|--------|--------|
| `psi.cpu_some_avg10/60/300` | gauge | % | `/proc/pressure/cpu` `some` line | ✅ T3 |
| `psi.mem_some_avg10/60/300` | gauge | % | `/proc/pressure/memory` `some` line | ✅ T3 |
| `psi.mem_full_avg10/60/300` | gauge | % | `/proc/pressure/memory` `full` line | ✅ T3 |
| `psi.io_some_avg10/60/300` | gauge | % | `/proc/pressure/io` `some` line | ✅ T3 |
| `psi.io_full_avg10/60/300` | gauge | % | `/proc/pressure/io` `full` line | ✅ T3 |

**Implementation**: `probe/src/collectors/psi.rs`. Requires kernel ≥ 4.20 with `CONFIG_PSI=y`. All 3 files must exist; if any is missing, entire PSI is `None`. 15 float values total.

### 1.7 TCP Connection State (T3)

| Metric | Type | Unit | Source | Status |
|--------|------|------|--------|--------|
| `tcp.established` | gauge | count | `/proc/net/sockstat` `TCP: inuse` | ✅ T3 |
| `tcp.time_wait` | gauge | count | `/proc/net/sockstat` `TCP: tw` | ✅ T3 |
| `tcp.orphan` | gauge | count | `/proc/net/sockstat` `TCP: orphan` | ✅ T3 |
| `tcp.allocated` | gauge | count | `/proc/net/sockstat` `TCP: alloc` | ✅ T3 |

**Implementation**: `probe/src/collectors/tcp.rs`.

### 1.8 File Descriptor Usage (T3)

| Metric | Type | Unit | Source | Status |
|--------|------|------|--------|--------|
| `fd.allocated` | gauge | count | `/proc/sys/fs/file-nr` field 0 | ✅ T3 |
| `fd.max` | gauge | count | `/proc/sys/fs/file-nr` field 2 | ✅ T3 |

**Implementation**: `probe/src/collectors/fd.rs`.

### 1.9 Uptime

| Metric | Type | Unit | Source | Status |
|--------|------|------|--------|--------|
| `uptime_seconds` | gauge | seconds | `/proc/uptime` field 1 | ✅ |

Included in every `MetricsPayload`. Also used for alert #7 (uptime_anomaly).

### T1 Collection Cost Summary

| Source | Signals | Cost per tick |
|--------|---------|---------------|
| `/proc/stat` | CPU usage/iowait/steal + ctxt/forks/procs | 1 file read + delta |
| `/proc/loadavg` | CPU load 1/5/15 | 1 file read |
| `/proc/meminfo` | Memory + swap (6 metrics) | 1 file read |
| `/proc/vmstat` | OOM kills | 1 file read + delta |
| `statvfs()` | Disk space per mount | 1 syscall per mount |
| `/proc/diskstats` | Disk I/O per device | 1 file read + delta |
| `/sys/class/net/*/statistics/*` | Network counters | 4 file reads per interface |
| `/proc/pressure/{cpu,memory,io}` | PSI pressure (15 values) | 3 file reads |
| `/proc/net/sockstat` | TCP state (4 values) | 1 file read |
| `/proc/sys/fs/file-nr` | FD usage (2 values) | 1 file read |
| `/proc/uptime` | Uptime | 1 file read |

**Total: ~22 file reads per cycle.** Netdata runs hundreds of collectors per tick.

---

## Identity: Host Attributes (startup + every 6h)

Static host information sent via `IdentityPayload` to `POST /api/identity`. Uses 2-state wire semantics: key present = update, key absent = retain. Full design in [10-host-inventory.md](./10-host-inventory.md).

### Core Fields (always sent)

| Field | Type | Source | Status |
|-------|------|--------|--------|
| `host_id` | string | Config or `/etc/hostname` fallback | ✅ |
| `hostname` | string | `/etc/hostname` | ✅ |
| `os` | string | `/etc/os-release` PRETTY_NAME | ✅ |
| `kernel` | string | `/proc/version` | ✅ |
| `arch` | string | `uname -m` (libc) | ✅ |
| `cpu_model` | string | `/proc/cpuinfo` first `model name` | ✅ |
| `uptime_seconds` | u64 | `/proc/uptime` field 1 | ✅ |
| `boot_time` | u64 epoch | `now() - uptime` | ✅ |
| `probe_version` | string | `CARGO_PKG_VERSION` compile-time | ✅ |

### Inventory Fields (optional, 2-state wire)

| # | Field | Type | Source | Status |
|---|-------|------|--------|--------|
| S1 | `cpu_logical` | u32 | `/proc/cpuinfo` `^processor` line count | ✅ |
| S2 | `cpu_physical` | u32 | `/proc/cpuinfo` unique (physical_id, core_id) pairs; fallback chain | ✅ |
| S3 | `mem_total_bytes` | u64 | `/proc/meminfo` MemTotal × 1024 | ✅ |
| S4 | `swap_total_bytes` | u64 | `/proc/meminfo` SwapTotal × 1024 | ✅ |
| S5 | `virtualization` | string | `/sys/class/dmi/id/sys_vendor` + `product_name`; fallback `/proc/1/cgroup` | ✅ |
| S6 | `net_interfaces` | array | `/sys/class/net/` + `address` + `speed` + `/proc/net/if_inet6` | ✅ |
| S7 | `disks` | array | `/sys/block/{dev}/size` + `queue/rotational` | ✅ |
| S8 | `boot_mode` | string | `/sys/firmware/efi` existence → "uefi" / "bios" | ✅ |
| — | `public_ip` | string | `https://echo.nocoo.cloud/api/ip` (startup + every 1h) | ✅ |

**Implementation**: `probe/src/collectors/identity.rs` (core) + `probe/src/collectors/inventory.rs` (S5-S8).

#### Net Interface Struct

```
{ iface, mac, ipv4: [], ipv6: [], speed_mbps }
```

Excludes `lo`. IPv6 from `/proc/net/if_inet6`. Speed from `/sys/class/net/{iface}/speed` (None for virtual interfaces).

#### Block Device Struct

```
{ device, size_bytes, rotational }
```

Excludes `loop*`, `ram*`, `dm-*`, partitions, zero-size devices.

#### Virtualization Detection

Maps `/sys/class/dmi/id/sys_vendor`: QEMU→kvm, Amazon EC2→aws, Microsoft Corporation→hyperv, Google→gce, DigitalOcean→digitalocean, Hetzner→hetzner, VMware*→vmware, Xen*→xen, innotek GmbH→virtualbox. Fallback: `/proc/1/cgroup` for container detection. Otherwise: bare-metal.

---

## Tier 2: Periodic Checks (startup + every 6h)

Heavier operations (fork processes, file scans). Run in background via `spawn_blocking`, non-blocking to T1 tick. Sent via `Tier2Payload` to `POST /api/tier2`.

### 2.1 Package Updates

| Field | Type | Source | Status |
|-------|------|--------|--------|
| `updates.total_count` | u32 | `apt list --upgradable` | ✅ |
| `updates.security_count` | u32 | Source contains "security" | ✅ |
| `updates.list[]` | array | Per package: name, current_version, new_version, is_security | ✅ |
| `updates.reboot_required` | bool | `/var/run/reboot-required` existence | ✅ |
| `updates.cache_age_seconds` | u64 | `/var/lib/apt/lists` mtime delta | ✅ |

**Implementation**: `probe/src/tier2/updates.rs`. Only collected when `apt` is available (Debian/Ubuntu). Does NOT run `apt update`.

### 2.2 Disk Deep Scan

| Field | Type | Source | Status |
|-------|------|--------|--------|
| `disk_deep.top_dirs[]` | array | `du -xb --max-depth=1 /` → top 10 by size | ✅ |
| `disk_deep.journal_bytes` | u64 | `journalctl --disk-usage` | ✅ |
| `disk_deep.large_files[]` | array | `find / -xdev -type f -size +100M` → top 20 | ✅ |

**Implementation**: `probe/src/tier2/disk_deep.rs`. Three commands run concurrently.

### 2.3 Docker Status

| Field | Type | Source | Status |
|-------|------|--------|--------|
| `docker.installed` | bool | `/var/run/docker.sock` existence | ✅ |
| `docker.version` | string | `docker version --format` | ✅ |
| `docker.containers[]` | array | `docker ps -a` + `docker stats` + `docker inspect` | ✅ |
| `docker.images.total_count` | u32 | `docker system df` | ✅ |
| `docker.images.total_bytes` | u64 | `docker system df` | ✅ |
| `docker.images.reclaimable_bytes` | u64 | `docker system df` | ✅ |

Per container: id, name, image, status, state, cpu_pct, mem_bytes, restart_count, started_at.

**Implementation**: `probe/src/tier2/docker.rs`.

### 2.4 Service Ports

| Field | Type | Source | Status |
|-------|------|--------|--------|
| `ports.listening[]` | array | `/proc/net/tcp` + `/proc/net/tcp6` (state=0A) | ✅ |

Per port: port, bind, protocol, pid, process. PID mapping via `/proc/{pid}/fd/` → socket inode.

**Implementation**: `probe/src/tier2/ports.rs`. Runs in `spawn_blocking`.

### 2.5 Security Posture

| Field | Type | Source | Status |
|-------|------|--------|--------|
| `security.ssh_password_auth` | bool | `/etc/ssh/sshd_config` + `sshd_config.d/*.conf` (Include-aware, first-match) | ✅ |
| `security.ssh_root_login` | string | Same (values: "yes"/"no"/"prohibit-password") | ✅ |
| `security.ssh_failed_logins_7d` | u64 | `journalctl -u ssh(d) --since "7 days ago"` | ✅ |
| `security.firewall_active` | bool | `ufw status` → fallback `iptables -L INPUT -n` | ✅ |
| `security.firewall_default_policy` | string | Same | ✅ |
| `security.fail2ban_active` | bool | `systemctl is-active fail2ban` | ✅ |
| `security.fail2ban_banned_count` | u32 | `fail2ban-client status sshd` | ✅ |
| `security.unattended_upgrades_active` | bool | `systemctl is-active unattended-upgrades` | ✅ |

**Implementation**: `probe/src/tier2/security.rs`. All fields are `Option` — omitted if tool not found.

### 2.6 Systemd Services

| Field | Type | Source | Status |
|-------|------|--------|--------|
| `systemd.failed_count` | u32 | `systemctl list-units --state=failed --no-legend --plain` | ✅ |
| `systemd.failed[]` | array | Per unit: unit, load_state, active_state, sub_state, description | ✅ |

**Implementation**: `probe/src/tier2/systemd.rs`. Only `.service` units (excludes .timer, .socket etc.).

### 2.7 Slow-Drift Fields (stored in `hosts` table, not `tier2_snapshots`)

| # | Field | Type | Source | Status |
|---|-------|------|--------|--------|
| D1 | `timezone` | string | `/etc/timezone`, fallback `readlink /etc/localtime` | ✅ |
| D2 | `dns_resolvers` | array | `/etc/resolv.conf` `nameserver` lines | ✅ |
| D3 | `dns_search` | array | `/etc/resolv.conf` `search` line | ✅ |

These are sent in the `Tier2Payload` but merged into the `hosts` table (not `tier2_snapshots`), because they describe host identity rather than point-in-time snapshots.

**Implementation**: `probe/src/collectors/inventory.rs` (timezone, dns).

---

## Alert Rules (21 total, all implemented)

The probe reports raw numbers. The Worker evaluates alerts server-side. All 21 rules are implemented.

### Tier 1 Rules (evaluated on every `POST /api/ingest`)

| # | Rule ID | Condition | Severity | Duration | Notes |
|---|---------|-----------|----------|----------|-------|
| 1 | `mem_high` | `mem.used_pct > 85` AND `swap.used_pct > 50` | critical | instant | |
| 2 | `no_swap` | `swap.total_bytes == 0` AND `mem.used_pct > 70` | critical | instant | |
| 3 | `disk_full` | ANY `disk[].used_pct > 85` | critical | instant | First disk only |
| 4 | `iowait_high` | `cpu.iowait_pct > 20` | warning | 5 min | |
| 5 | `steal_high` | `cpu.steal_pct > 10` | warning | 5 min | |
| 6 | `host_offline` | `last_seen > 120s` | critical | query-time | Server-side status derivation; no `alert_states` row |
| 7 | `uptime_anomaly` | `uptime_seconds < 300` | info | instant | Defined in T2 rules but evaluated at T1 cadence |

### Tier 2 Rules (evaluated on every `POST /api/tier2`)

| # | Rule ID | Condition | Severity | Duration | Notes |
|---|---------|-----------|----------|----------|-------|
| 8 | `ssh_password_auth` | `security.ssh_password_auth == true` | critical | instant | |
| 9 | `ssh_root_login` | `security.ssh_root_login == "yes"` | critical | instant | |
| 10 | `no_firewall` | `security.firewall_active == false` | critical | instant | |
| 11 | `public_port` | Port on `0.0.0.0`/`::`, not in allowlist [22, 80, 443] | warning | instant | |
| 12 | `security_updates` | `updates.security_count > 0` | warning | 7 days | |
| 13 | `container_restart` | ANY `docker.containers[].restart_count > 5` | critical | instant | |
| 14 | `systemd_failed` | `systemd.failed_count > 0` | warning | instant | |
| 15 | `reboot_required` | `updates.reboot_required == true` | info | 7 days | |

### Tier 3 Rules (evaluated on every `POST /api/ingest`, optional fields)

| # | Rule ID | Condition | Severity | Duration | Notes |
|---|---------|-----------|----------|----------|-------|
| 16 | `cpu_pressure` | `psi.cpu_some_avg60 > 25` | warning | 5 min | Requires kernel ≥ 4.20 |
| 17 | `mem_pressure` | `psi.mem_some_avg60 > 10` | warning | 5 min | |
| 18 | `io_pressure` | `psi.io_some_avg60 > 20` | warning | 5 min | |
| 19 | `disk_io_saturated` | ANY `disk_io[].io_util_pct > 80` | warning | 5 min | First device only |
| 20 | `tcp_conn_leak` | `tcp.time_wait > 500` | warning | 5 min | |
| 21 | `oom_kill` | `mem.oom_kills_delta > 0` | critical | instant | |

**Note**: T3 rules only evaluate if the optional field is present. Probes < v0.4.0 omit T3 fields.

### Alert Evaluation Mechanics

- **Instant rules** (duration = 0): Fired → UPSERT into `alert_states`. Not fired → DELETE from `alert_states`. Self-healing.
- **Duration rules** (duration > 0): First fire → INSERT into `alert_pending`. Sustained ≥ duration → promote to `alert_states`. Condition clears → DELETE from both.
- **Host status derivation**: offline (>120s) > critical > warning > healthy. `info` severity does NOT affect status.

---

## Data Retention

| Table | Retention | Aggregation |
|-------|-----------|-------------|
| `metrics_raw` | 7 days | None (raw 30s samples) |
| `metrics_hourly` | 90 days | Cron: avg/max/min/sum per hour |
| `tier2_snapshots` | 90 days | None (6h snapshots) |

---

## Resource Budget

| Resource | Actual | Target | Netdata comparison |
|----------|--------|--------|--------------------|
| RSS memory | ~2 MB | < 15 MB | 120-243 MB |
| CPU (idle) | < 0.1% | < 0.1% | 1-3% |
| Binary size | ~300 KB (stripped) | < 10 MB | 200+ MB installed |
| Network | ~1.1 KB/report × 2/min | ~3 KB/min | 50+ KB/min |
| File reads/tick | ~22 | — | Hundreds |
| Dependencies | none (static binary) | — | Python, Go plugins, Node.js |
