# 01 — Metrics Catalogue

> Complete catalogue of all metrics the bat system can collect, with procfs/sysfs sources and collection commands.
> This document is the **authoritative reference** for metric names, types, units, and data sources.
>
> Tier 1 metrics are implemented in MVP. Tier 2 metrics are deferred to post-MVP.
> For implementation details, see [04-probe.md](./04-probe.md). For payload types, see [03-data-structures.md](./03-data-structures.md).
>
> Related documents:
> - [02-architecture.md](./02-architecture.md) — System overview
> - [03-data-structures.md](./03-data-structures.md) — Payload types, D1 schema, alert rules
> - [04-probe.md](./04-probe.md) — Probe implementation (Tier 1 collectors)

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

## Tier 1: Real-Time (every 30s) — MVP

Cheap to read (procfs/sysfs, < 1ms each). Implementation in [04-probe.md § Collectors](./04-probe.md). Payload types in [03-data-structures.md § Metrics payload](./03-data-structures.md).

### 1.1 CPU

| Metric | Type | Unit | Source |
|--------|------|------|--------|
| `cpu.load1` | gauge | float | `/proc/loadavg` field 1 |
| `cpu.load5` | gauge | float | `/proc/loadavg` field 2 |
| `cpu.load15` | gauge | float | `/proc/loadavg` field 3 |
| `cpu.usage_pct` | gauge | % | `/proc/stat` cpu line, delta (user+nice+system)/total × 100 |
| `cpu.iowait_pct` | gauge | % | `/proc/stat` cpu line, delta iowait/total × 100 |
| `cpu.steal_pct` | gauge | % | `/proc/stat` cpu line, delta steal/total × 100 |
| `cpu.count` | gauge | int | `/proc/cpuinfo` processor count (static, read once) |

**Audit context**: docker.nocoo.cloud had 30-34% iowait — neighbor-noise problem invisible to CPU load. All 6 hosts showed 0% steal but this is the canary for oversold providers.

### 1.2 Memory

| Metric | Type | Unit | Source |
|--------|------|------|--------|
| `mem.total_bytes` | gauge | bytes | `/proc/meminfo` MemTotal × 1024 |
| `mem.available_bytes` | gauge | bytes | `/proc/meminfo` MemAvailable × 1024 |
| `mem.used_pct` | gauge | % | `(total - available) / total × 100` |
| `swap.total_bytes` | gauge | bytes | `/proc/meminfo` SwapTotal × 1024 |
| `swap.used_bytes` | gauge | bytes | `/proc/meminfo` (SwapTotal - SwapFree) × 1024 |
| `swap.used_pct` | gauge | % | `used / total × 100` (0 if no swap) |

**Audit context**: tongji.nocoo.cloud had zero swap + only 484 MB free (25%) — one spike away from OOM kill.

### 1.3 Disk

| Metric | Type | Unit | Source |
|--------|------|------|--------|
| `disk.{mount}.total_bytes` | gauge | bytes | `statvfs()` on each mount |
| `disk.{mount}.used_pct` | gauge | % | `(total - available) / total × 100` |
| `disk.{mount}.avail_bytes` | gauge | bytes | `statvfs()` f_bavail × f_frsize |

Mount discovery: `/proc/mounts` → filter ext4, xfs, btrfs, overlay. Exclude tmpfs, devtmpfs, squashfs, proc, sysfs, devpts, cgroup.

**Audit context**: tongji `/` at 71% but `/server` at 24% — aggregate metric would hide the problem.

### 1.4 Network

| Metric | Type | Unit | Source |
|--------|------|------|--------|
| `net.{iface}.rx_bytes_rate` | gauge | bytes/sec | `/sys/class/net/{iface}/statistics/rx_bytes` delta/interval |
| `net.{iface}.tx_bytes_rate` | gauge | bytes/sec | `/sys/class/net/{iface}/statistics/tx_bytes` delta/interval |
| `net.{iface}.rx_errors` | counter | int | `/sys/class/net/{iface}/statistics/rx_errors` |
| `net.{iface}.tx_errors` | counter | int | `/sys/class/net/{iface}/statistics/tx_errors` |

Interface discovery: list `/sys/class/net/`, exclude `lo`. Config excludes `docker0` by default.

Counters are u64. Rate = `(current - previous) / interval`. Handle wrap.

### 1.5 System Identity (startup + every 6h)

| Field | Type | Source |
|-------|------|--------|
| `sys.hostname` | string | `/etc/hostname` |
| `sys.os` | string | `/etc/os-release` PRETTY_NAME |
| `sys.kernel` | string | `/proc/version` |
| `sys.arch` | string | `uname -m` |
| `sys.cpu_model` | string | `/proc/cpuinfo` model name |
| `sys.uptime_seconds` | gauge | `/proc/uptime` field 1 |
| `sys.boot_time` | timestamp | `now() - uptime` |

### Collection cost

| Source | Metrics | Cost |
|--------|---------|------|
| `/proc/loadavg` | CPU load | 1 file read |
| `/proc/stat` | CPU usage/iowait/steal | 1 file read + diff |
| `/proc/meminfo` | Memory + swap | 1 file read |
| `statvfs()` | Disk per mount | 1 syscall per mount |
| `/sys/class/net/*/statistics/*` | Network counters | 4 file reads per interface |
| `/proc/uptime` | Uptime | 1 file read |

**Total: ~15 file reads per cycle.** Netdata runs hundreds of collectors per tick.

---

## Tier 2: Periodic Checks (every 6h) — Post-MVP

Heavier operations (fork processes, read package DB, scan filesystem). Deferred to post-MVP. This section is the **design reference** for future implementation.

### 2.1 Package Updates

| Metric | Type | Source |
|--------|------|--------|
| `updates.total_count` | gauge | `apt list --upgradable` |
| `updates.security_count` | gauge | `apt list --upgradable \| grep -i secur` |
| `updates.list` | array | Package name + version pairs |
| `updates.reboot_required` | bool | `test -f /var/run/reboot-required` |
| `updates.cache_age_seconds` | gauge | `stat -c %Y /var/lib/apt/lists/partial/` |

**Note**: Probe does NOT run `apt update` (modifies state, needs root). Reads existing cache only.

### 2.2 Disk Deep Scan

| Metric | Type | Source |
|--------|------|--------|
| `disk.top_dirs` | array | `du -sh /* \| sort -rh \| head -10` |
| `disk.journal_bytes` | gauge | `journalctl --disk-usage` |
| `disk.large_files` | array | `find / -xdev -type f -size +100M` |

### 2.3 Docker Status

| Metric | Type | Source |
|--------|------|--------|
| `docker.installed` | bool | `command -v docker` |
| `docker.version` | string | `docker version` |
| `docker.containers` | array | Per-container: status, restart_count, cpu_pct, mem_bytes, uptime |
| `docker.images.total_bytes` | gauge | `docker system df` |
| `docker.images.reclaimable_bytes` | gauge | `docker system df` |

Alternative: read cgroup v2 files directly (`/sys/fs/cgroup/system.slice/docker-{id}.scope/`) to avoid `docker stats` overhead.

### 2.4 Service Ports

| Metric | Type | Source |
|--------|------|--------|
| `ports.listening` | array | `/proc/net/tcp` + `/proc/net/tcp6`, filter `st=0A` (LISTEN) |

Per port: `{ port, bind, protocol, pid, process }`. Map via `/proc/{pid}/fd/` → socket inode.

**Audit context**: Netdata (19999), iperf3 (5201), rsync (10873) all exposed on `0.0.0.0` across 4 hosts.

### 2.5 Security Posture

| Metric | Type | Source |
|--------|------|--------|
| `ssh.password_auth` | bool | `/etc/ssh/sshd_config` + `sshd_config.d/*.conf` |
| `ssh.root_login` | string | Same |
| `ssh.failed_logins_7d` | gauge | `journalctl -u ssh --since "7 days ago"` |
| `firewall.active` | bool | `ufw status` / `iptables -L INPUT` |
| `firewall.default_policy` | string | Same |
| `fail2ban.active` | bool | `systemctl is-active fail2ban` |
| `fail2ban.banned_count` | gauge | `fail2ban-client status sshd` |
| `unattended_upgrades.active` | bool | `systemctl is-active unattended-upgrades` |

**Audit context**: us2.nocoo.cloud had PasswordAuthentication=yes + PermitRootLogin=yes + no firewall — 10,248 brute force attempts in 7 days.

### 2.6 Systemd Services

| Metric | Type | Source |
|--------|------|--------|
| `services.failed` | array | `systemctl list-units --state=failed` |
| `services.failed_count` | gauge | Count of above |

---

## Alert Rules (all 15)

The probe reports raw numbers. The Worker derives alerts. 6 rules use Tier 1 data (MVP), 1 uses Tier 1 but is deferred (low priority), 8 require Tier 2 (post-MVP). Implementation of the 6 MVP rules in [03-data-structures.md § Alert rules](./03-data-structures.md) and [05-worker.md § Alert evaluation](./05-worker.md).

| # | Alert | Condition | Severity | Tier | Status |
|---|-------|-----------|----------|------|--------|
| 1 | High memory | `mem.used_pct > 85` AND `swap.used_pct > 50` | critical | 1 | **MVP** |
| 2 | No swap | `swap.total_bytes == 0` AND `mem.used_pct > 70` | critical | 1 | **MVP** |
| 3 | Disk full | `disk.{mount}.used_pct > 85` | critical | 1 | **MVP** |
| 4 | High iowait | `cpu.iowait_pct > 20` for 5 min | warning | 1 | **MVP** |
| 5 | High steal | `cpu.steal_pct > 10` for 5 min | warning | 1 | **MVP** |
| 6 | Host offline | `last_seen > 120s ago` | critical | — | **MVP** (server-side) |
| 7 | Uptime anomaly | `uptime_seconds < 300` | info | 1 | **Deferred** |
| 8 | Password auth | `ssh.password_auth == true` | critical | 2 | Deferred |
| 9 | Root login | `ssh.root_login == "yes"` | critical | 2 | Deferred |
| 10 | No firewall | `firewall.active == false` | critical | 2 | Deferred |
| 11 | Public port | port on `0.0.0.0`, not in allowlist | warning | 2 | Deferred |
| 12 | Security updates | `updates.security_count > 0` for 7d | warning | 2 | Deferred |
| 13 | Container restart loop | `restart_count > 5` in 1h | critical | 2 | Deferred |
| 14 | Systemd unit failed | `services.failed_count > 0` | warning | 2 | Deferred |
| 15 | Reboot required | `reboot_required == true` for 7d | info | 2 | Deferred |

**Note**: Rule #6 (host_offline) is server-side only — not derived from probe metrics. Rule #7 (uptime anomaly) uses Tier 1 data but is deferred to post-MVP (info severity, low priority).

---

## Resource Budget

| Resource | Target | Netdata comparison |
|----------|--------|--------------------|
| RSS memory | < 15 MB | 120-243 MB |
| CPU (idle) | < 0.1% | 1-3% |
| Binary size | < 10 MB | 200+ MB installed |
| Network | ~1 KB/report × 2/min = ~3 KB/min | 50+ KB/min |
| Dependencies | none (static binary) | Python, Go plugins, Node.js |

Full resource verification in [02-architecture.md § Resource budget](./02-architecture.md).
