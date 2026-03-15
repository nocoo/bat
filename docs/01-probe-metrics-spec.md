# 01 — VPS Probe Metrics Specification

> Design driven by real-world audit of 6 VPS hosts on 2026-03-15.
> This document defines **what** the probe collects and **how** to collect it on Linux.
> Architecture (transport, storage, API) is out of scope — handled by bat core.

## Fleet Context

| Host | Spec | OS | Role |
|------|------|----|------|
| jp.nocoo.cloud | 1C/1G | Debian 12 | frp relay + monitoring |
| us.nocoo.cloud | 3C/3.3G | Debian 12 | Uptime Kuma + GOST proxy |
| us2.nocoo.cloud | 2C/2.4G | Ubuntu 24.04 | Xray proxy |
| blog.nocoo.cloud | 1C/1.8G | Ubuntu 22.04 | LEMP blog (Nginx+PHP+MySQL+Redis) |
| docker.nocoo.cloud | 2C/3.8G | Ubuntu 24.04 | Caddy + n8n + Portainer + Watchtower |
| tongji.nocoo.cloud | 1C/1.9G | Ubuntu 20.04 | Nginx + PHP + MySQL + Outline VPN |

## Design Principles

1. **Probe must be < 15 MB RSS** — Netdata uses 120-243 MB, which is unacceptable on 1G machines
2. **No root required for real-time metrics** — use `/proc` and `/sys` directly, only security/update checks need sudo
3. **Two-tier collection** — fast metrics every 30s, slow checks every 6h
4. **Crash = restart** — probe is stateless, all state lives server-side
5. **Single binary** — no plugin system, no dependencies, just one binary + config

## Metric Categories

### Tier 1: Real-Time (every 30s)

These metrics are cheap to read (procfs/sysfs, < 1ms each) and give a live pulse.

#### 1.1 CPU

| Metric | Type | Unit | Source | How |
|--------|------|------|--------|-----|
| `cpu.load1` | gauge | float | `/proc/loadavg` | `awk '{print $1}' /proc/loadavg` |
| `cpu.load5` | gauge | float | `/proc/loadavg` | `awk '{print $2}' /proc/loadavg` |
| `cpu.load15` | gauge | float | `/proc/loadavg` | `awk '{print $3}' /proc/loadavg` |
| `cpu.usage_pct` | gauge | % | `/proc/stat` | Parse `cpu` line, diff two reads (user+nice+system)/(total) × 100. Requires keeping previous sample. |
| `cpu.iowait_pct` | gauge | % | `/proc/stat` | Same diff approach, iowait field / total delta × 100 |
| `cpu.steal_pct` | gauge | % | `/proc/stat` | Same diff approach, steal field / total delta × 100 |
| `cpu.count` | gauge | int | `/proc/cpuinfo` | `grep -c '^processor' /proc/cpuinfo` (static, read once at startup) |

**Why iowait matters:** Our audit found docker.nocoo.cloud with 30-34% iowait — the only bottleneck on an otherwise idle machine. This single metric revealed a VPS neighbor-noise problem that CPU load alone would miss.

**Why steal matters:** Detects hypervisor-level CPU throttling on shared VPS. All 6 hosts showed 0% steal today, but this is the canary for oversold providers.

#### 1.2 Memory

| Metric | Type | Unit | Source | How |
|--------|------|------|--------|-----|
| `mem.total_bytes` | gauge | bytes | `/proc/meminfo` | `MemTotal` × 1024 |
| `mem.available_bytes` | gauge | bytes | `/proc/meminfo` | `MemAvailable` × 1024 |
| `mem.used_pct` | gauge | % | computed | `(total - available) / total × 100` |
| `swap.total_bytes` | gauge | bytes | `/proc/meminfo` | `SwapTotal` × 1024 |
| `swap.used_bytes` | gauge | bytes | `/proc/meminfo` | `(SwapTotal - SwapFree)` × 1024 |
| `swap.used_pct` | gauge | % | computed | `used / total × 100` (0 if no swap) |

**Why this matters:** tongji.nocoo.cloud had zero swap + only 484 MB free (25%) — one memory spike away from OOM kill. The probe must alert when `mem.available_bytes` drops below a threshold AND swap is absent/exhausted.

Parsing `/proc/meminfo`:
```
grep -E '^(MemTotal|MemAvailable|SwapTotal|SwapFree):' /proc/meminfo
```
Output format: `MemTotal:        1946360 kB` — parse the integer, multiply by 1024.

#### 1.3 Disk

| Metric | Type | Unit | Source | How |
|--------|------|------|--------|-----|
| `disk.{mount}.total_bytes` | gauge | bytes | `statvfs()` | syscall on each mount point |
| `disk.{mount}.used_pct` | gauge | % | `statvfs()` | `(total - available) / total × 100` |
| `disk.{mount}.avail_bytes` | gauge | bytes | `statvfs()` | `f_bavail × f_frsize` |

**Mount discovery:** Read `/proc/mounts`, filter to real filesystems (ext4, xfs, btrfs, overlay), exclude pseudo-fs (proc, sysfs, tmpfs, devpts, cgroup). Use `statvfs()` syscall for each mount — this is what `df` does internally.

**Why per-mount matters:** tongji has `/` at 71% but `/server` at 24% — aggregate disk metric would hide the problem.

#### 1.4 Network

| Metric | Type | Unit | Source | How |
|--------|------|------|--------|-----|
| `net.{iface}.rx_bytes` | counter | bytes | `/sys/class/net/{iface}/statistics/rx_bytes` | Direct file read, diff between samples to get rate |
| `net.{iface}.tx_bytes` | counter | bytes | `/sys/class/net/{iface}/statistics/tx_bytes` | Same |
| `net.{iface}.rx_packets` | counter | int | `/sys/class/net/{iface}/statistics/rx_packets` | Same |
| `net.{iface}.tx_packets` | counter | int | `/sys/class/net/{iface}/statistics/tx_packets` | Same |
| `net.{iface}.rx_errors` | counter | int | `/sys/class/net/{iface}/statistics/rx_errors` | Same |
| `net.{iface}.tx_errors` | counter | int | `/sys/class/net/{iface}/statistics/tx_errors` | Same |

**Interface discovery:** List `/sys/class/net/`, exclude `lo`. Typical VPS has `eth0` or `ens*`. Docker hosts also have `docker0`, `br-*`, `veth*` — include `eth0`/`ens*` only by default, option to include bridge interfaces.

Rate calculation: `(current_value - previous_value) / interval_seconds`. Counters are 64-bit unsigned, handle overflow.

#### 1.5 System Identity (sent once at startup, then on change)

| Metric | Type | Source | How |
|--------|------|--------|-----|
| `sys.hostname` | string | `hostname` | `cat /etc/hostname` |
| `sys.os` | string | `/etc/os-release` | Parse `PRETTY_NAME` |
| `sys.kernel` | string | `uname -r` | `cat /proc/version` first field |
| `sys.arch` | string | `uname -m` | `cat /proc/sys/kernel/arch` or `uname -m` |
| `sys.cpu_model` | string | `/proc/cpuinfo` | `grep 'model name' /proc/cpuinfo | head -1` |
| `sys.uptime_seconds` | gauge | `/proc/uptime` | `awk '{print $1}' /proc/uptime` |
| `sys.boot_time` | timestamp | computed | `now() - uptime` |

### Tier 2: Periodic Checks (every 6h)

These are heavier operations (fork processes, read package DB, scan filesystem). Run on a separate timer, not mixed with real-time metrics.

#### 2.1 Package Updates

| Metric | Type | Source | How |
|--------|------|--------|-----|
| `updates.total_count` | gauge | apt | See below |
| `updates.security_count` | gauge | apt | See below |
| `updates.list` | array | apt | Package name + current → available version |
| `updates.reboot_required` | bool | file | `test -f /var/run/reboot-required` |

**How to check apt updates without `apt update`:**

The probe should NOT run `apt update` (modifies state, needs root, slow). Instead, read the existing package cache:

```bash
# Count upgradable packages from last apt update cache
apt list --upgradable 2>/dev/null | grep -c upgradable

# Get security updates specifically
apt list --upgradable 2>/dev/null | grep -i secur | wc -l

# Structured list (parseable)
apt list --upgradable 2>/dev/null | tail -n +2
```

**Caveat:** This reads whatever the last `apt update` cached. The probe assumes unattended-upgrades or a cron runs `apt update` periodically. The probe reports the age of the cache:

```bash
# Cache age in seconds
echo $(( $(date +%s) - $(stat -c %Y /var/lib/apt/lists/partial/ 2>/dev/null || echo 0) ))
```

#### 2.2 Disk Deep Scan

| Metric | Type | Source | How |
|--------|------|--------|-----|
| `disk.top_dirs` | array | `du` | Top 10 largest directories under `/` |
| `disk.journal_bytes` | gauge | journalctl | `journalctl --disk-usage` output |
| `disk.large_files` | array | find | Files > 100MB outside known paths |

```bash
# Top 10 dirs (fast, depth-limited)
du -sh /* 2>/dev/null | sort -rh | head -10

# Journal size
journalctl --disk-usage 2>/dev/null | grep -oP '[\d.]+[KMGT]'

# Large files (excluding expected locations like /swapfile)
find / -xdev -type f -size +100M \
  ! -path '/swapfile' \
  ! -path '/proc/*' \
  ! -path '/sys/*' \
  ! -path '/dev/*' \
  -exec ls -lh {} \; 2>/dev/null
```

#### 2.3 Docker Status (if Docker installed)

| Metric | Type | Source | How |
|--------|------|--------|-----|
| `docker.installed` | bool | — | `command -v docker` |
| `docker.version` | string | docker | `docker version --format '{{.Server.Version}}'` |
| `docker.containers` | array | docker | See below |
| `docker.images.total_bytes` | gauge | docker | `docker system df` parsed |
| `docker.images.reclaimable_bytes` | gauge | docker | `docker system df` parsed |

**Per-container metrics (only if Docker detected):**

| Metric | Type | How |
|--------|------|-----|
| `container.{name}.status` | string | `docker inspect --format '{{.State.Status}}'` |
| `container.{name}.restart_count` | gauge | `docker inspect --format '{{.RestartCount}}'` |
| `container.{name}.cpu_pct` | gauge | `docker stats --no-stream --format '{{.CPUPerc}}'` |
| `container.{name}.mem_bytes` | gauge | `docker stats --no-stream --format '{{.MemUsage}}'` |
| `container.{name}.uptime` | string | `docker inspect --format '{{.State.StartedAt}}'` |

Alternative without shelling out to `docker` CLI: read cgroup v2 files directly:
```
/sys/fs/cgroup/system.slice/docker-{container_id}.scope/cpu.stat
/sys/fs/cgroup/system.slice/docker-{container_id}.scope/memory.current
```
This avoids the overhead of `docker stats` (which creates a streaming connection per call).

#### 2.4 Service Ports

| Metric | Type | Source | How |
|--------|------|--------|-----|
| `ports.listening` | array | `/proc/net/tcp` + `/proc/net/tcp6` | See below |

**Reading listening ports without `ss` or `netstat`:**

Parse `/proc/net/tcp` directly — each line is a socket. Filter for `st=0A` (LISTEN state):

```
# /proc/net/tcp format:
# sl  local_address rem_address   st  ...
#  0: 00000000:0016 00000000:0000 0A  ...
```

- `local_address` is hex IP:port — `00000000:0016` = `0.0.0.0:22`
- `st=0A` means LISTEN
- Map port to process via `/proc/{pid}/fd/` → socket inode lookup

For each listening port, report:
```json
{
  "port": 22,
  "bind": "0.0.0.0",
  "protocol": "tcp",
  "pid": 560,
  "process": "sshd"
}
```

**Why this matters:** Our audit found Netdata (19999), iperf3 (5201), rsync (10873) all accidentally exposed to 0.0.0.0. The probe should flag any port bound to `0.0.0.0` that is NOT in a known-good allowlist.

#### 2.5 Security Posture

| Metric | Type | Source | How |
|--------|------|--------|-----|
| `ssh.password_auth` | bool | sshd_config | See below |
| `ssh.root_login` | string | sshd_config | See below |
| `ssh.failed_logins_7d` | gauge | journal | See below |
| `firewall.active` | bool | ufw/iptables | See below |
| `firewall.default_policy` | string | ufw/iptables | See below |
| `fail2ban.active` | bool | systemctl | See below |
| `fail2ban.banned_count` | gauge | fail2ban-client | See below |
| `unattended_upgrades.active` | bool | systemctl | See below |

**SSH config (without root):**

The effective sshd config can be read by parsing files (sshd_config + sshd_config.d/*.conf). Later files override earlier ones:

```bash
# Get effective settings (needs root for sshd -T, but files are world-readable)
grep -rh '^PasswordAuthentication\|^PermitRootLogin\|^PubkeyAuthentication' \
  /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null | tail -1
```

**Why this matters:** Our audit found us2.nocoo.cloud with PasswordAuthentication=yes + PermitRootLogin=yes + no firewall — 10,248 brute force attempts in 7 days. The probe should scream if password auth is enabled.

**Firewall check:**

```bash
# UFW (preferred)
ufw status 2>/dev/null | head -1
# Falls back to iptables default policy
iptables -L INPUT -n 2>/dev/null | head -2 | grep -o 'policy [A-Z]*'
```

**Failed logins (requires journal access):**

```bash
journalctl -u ssh --since "7 days ago" 2>/dev/null | grep -c "Failed password"
```

#### 2.6 Systemd Services Health

| Metric | Type | Source | How |
|--------|------|--------|-----|
| `services.failed` | array | systemd | `systemctl list-units --state=failed --no-legend` |
| `services.failed_count` | gauge | systemd | Count of above |

```bash
systemctl list-units --state=failed --no-legend --no-pager 2>/dev/null
```

**Why:** A failed systemd unit is the earliest signal of a broken service, before any port goes down.

## Payload Schema

### Tier 1 Payload (every 30s)

```json
{
  "host_id": "jp.nocoo.cloud",
  "timestamp": 1742025600,
  "interval": 30,
  "cpu": {
    "load1": 0.07,
    "load5": 0.03,
    "load15": 0.01,
    "usage_pct": 2.1,
    "iowait_pct": 0.0,
    "steal_pct": 0.0,
    "count": 1
  },
  "mem": {
    "total_bytes": 1138688000,
    "available_bytes": 575668224,
    "used_pct": 49.4
  },
  "swap": {
    "total_bytes": 1678704640,
    "used_bytes": 32505856,
    "used_pct": 1.9
  },
  "disk": [
    {
      "mount": "/",
      "total_bytes": 22548578304,
      "avail_bytes": 15032385536,
      "used_pct": 31
    }
  ],
  "net": [
    {
      "iface": "eth0",
      "rx_bytes_rate": 37250,
      "tx_bytes_rate": 36875,
      "rx_errors": 0,
      "tx_errors": 0
    }
  ],
  "uptime_seconds": 2678400
}
```

### Tier 2 Payload (every 6h)

```json
{
  "host_id": "jp.nocoo.cloud",
  "timestamp": 1742025600,
  "updates": {
    "total_count": 18,
    "security_count": 0,
    "reboot_required": false,
    "cache_age_seconds": 3600,
    "packages": [
      {"name": "netdata", "current": "2.8.0", "available": "2.9.0"}
    ]
  },
  "disk_deep": {
    "top_dirs": [
      {"path": "/usr", "bytes": 2362232012},
      {"path": "/var", "bytes": 400556032}
    ],
    "journal_bytes": 6501376,
    "large_files": []
  },
  "docker": {
    "installed": false,
    "version": null,
    "containers": [],
    "images_total_bytes": 0,
    "images_reclaimable_bytes": 0
  },
  "ports": [
    {"port": 22, "bind": "0.0.0.0", "protocol": "tcp", "process": "sshd"},
    {"port": 7000, "bind": "0.0.0.0", "protocol": "tcp", "process": "frps"},
    {"port": 19999, "bind": "127.0.0.1", "protocol": "tcp", "process": "netdata"}
  ],
  "security": {
    "ssh": {
      "password_auth": false,
      "root_login": "prohibit-password",
      "pubkey_auth": true,
      "failed_logins_7d": 0
    },
    "firewall": {
      "active": true,
      "type": "ufw",
      "default_incoming": "deny"
    },
    "fail2ban": {
      "active": true,
      "sshd_banned": 0
    },
    "unattended_upgrades": true
  },
  "services": {
    "failed_count": 0,
    "failed": []
  }
}
```

## Collection Method Summary

All Tier 1 metrics are read from **procfs/sysfs** — zero process spawning, zero root needed:

| Source | Metrics | Cost |
|--------|---------|------|
| `/proc/loadavg` | CPU load | 1 file read |
| `/proc/stat` | CPU usage/iowait/steal | 1 file read, diff |
| `/proc/meminfo` | Memory + swap | 1 file read |
| `statvfs()` | Disk usage per mount | 1 syscall per mount |
| `/sys/class/net/*/statistics/*` | Network counters | 6 file reads per interface |
| `/proc/uptime` | System uptime | 1 file read |

**Total Tier 1 cost: ~15 file reads per cycle.** This is orders of magnitude cheaper than Netdata (which runs hundreds of collectors on every tick).

Tier 2 checks do spawn processes (`apt`, `docker`, `journalctl`), but only every 6 hours — negligible impact.

## Probe Resource Budget

| Resource | Target | Netdata for comparison |
|----------|--------|----------------------|
| RSS memory | < 15 MB | 120-243 MB |
| CPU (idle) | < 0.1% | 1-3% |
| Disk (binary) | < 10 MB | 200+ MB installed |
| Network (30s interval) | ~1 KB/report × 2/min = ~3 KB/min | 50+ KB/min |
| Dependencies | none (static binary) | Python, Go plugins, Node.js |

## Alerts the Server Should Derive

The probe is dumb — it just reports numbers. The bat server should derive alerts from these metrics:

| Alert | Condition | Severity | Learned from |
|-------|-----------|----------|-------------|
| High memory | `mem.used_pct > 85` AND `swap.used_pct > 50` | critical | tongji OOM risk |
| No swap | `swap.total_bytes == 0` AND `mem.used_pct > 70` | critical | tongji had 0 swap |
| Disk full | `disk.{mount}.used_pct > 85` | critical | tongji root at 71% |
| High iowait | `cpu.iowait_pct > 20` for 5 min | warning | docker 30-34% iowait |
| Password auth enabled | `ssh.password_auth == true` | critical | us2 10k brute force |
| Root login allowed | `ssh.root_login == "yes"` | critical | us2 + jp config conflict |
| No firewall | `firewall.active == false` | critical | us2, jp, tongji had none |
| Public port not in allowlist | port on 0.0.0.0, not in config allowlist | warning | Netdata 19999 exposed on 4 hosts |
| Security updates pending | `updates.security_count > 0` for 7d | warning | blog had 66 security updates |
| Container restart loop | `container.restart_count > 5` in 1h | critical | — |
| Systemd unit failed | `services.failed_count > 0` | warning | — |
| High steal | `cpu.steal_pct > 10` for 5 min | warning | oversold VPS detection |
| Reboot required | `updates.reboot_required == true` for 7d | info | — |
| Uptime anomaly | `uptime_seconds < 300` (unexpected reboot) | info | — |
