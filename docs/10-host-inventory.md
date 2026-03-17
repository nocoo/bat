# 10 — Host Inventory: Comprehensive Identity Collection

## Motivation

The probe's identity payload currently carries 7 fields (hostname, os, kernel, arch, cpu_model, uptime, boot_time). This is far too thin for fleet management — the host list page shows only hostname + CPU% + MEM% + uptime, offering almost zero context for triage or capacity planning.

A server monitoring product should let the operator answer questions like:
- "Which box has 10.0.1.42?"
- "How many servers still run on spinning disks?"
- "Is that a VM or bare metal?"
- "Which hosts only have 2 GB RAM?"

Most of this information is available by reading a single file from procfs/sysfs. No external commands, no elevated privileges, negligible I/O.

## Design Principles

1. **Cheap reads only** — single file read or single syscall, no subprocesses
2. **Categorize by volatility** — static fields in identity (every 6h), slow-changing fields in tier 2 (every 6h), fast-changing fields stay in metrics (every 30s)
3. **Backward compatible** — new fields are optional (`Option<T>` in Rust, nullable in D1, `?:` in TS) so old probes continue to work
4. **Display-ready** — collect in a form that can be shown directly, not raw hex

## Field Inventory

### Category S — Static Fields (Identity Payload)

These fields do not change without hardware replacement, re-provisioning, or reboot. Sent with `POST /api/identity` every 6 hours.

| # | Field | Source | Parse | Example Value |
|---|-------|--------|-------|---------------|
| S1 | `cpu_cores` | `/proc/cpuinfo` | count `^processor` lines | `4` |
| S2 | `cpu_threads` | `/proc/cpuinfo` | parse first `siblings` value | `8` |
| S3 | `mem_total_bytes` | `/proc/meminfo` | `MemTotal` × 1024 | `8388608000` |
| S4 | `swap_total_bytes` | `/proc/meminfo` | `SwapTotal` × 1024 | `2147483648` |
| S5 | `virtualization` | `/sys/class/dmi/id/sys_vendor` + `product_name` | map known vendors | `"kvm"`, `"vmware"`, `"bare-metal"` |
| S6 | `machine_id` | `/etc/machine-id` | trim | `"a1b2c3d4..."` (32 hex) |
| S7 | `net_interfaces` | `libc::getifaddrs()` + `/sys/class/net/{iface}/address` + `/sys/class/net/{iface}/speed` | per interface | `[{"iface":"eth0","mac":"aa:bb:cc:dd:ee:ff","ipv4":["10.0.1.5"],"ipv6":["fe80::1"],"speed_mbps":1000}]` |
| S8 | `disks` | `/sys/block/{dev}/size` + `/sys/block/{dev}/queue/rotational` | 512 × sectors; 0=SSD, 1=HDD | `[{"device":"sda","size_bytes":500107862016,"rotational":false}]` |
| S9 | `boot_mode` | `/sys/firmware/efi` | dir exists → `"uefi"`, else `"bios"` | `"uefi"` |

**Already collected (no change needed):** `hostname`, `os`, `kernel`, `arch`, `cpu_model`, `uptime_seconds`, `boot_time`

### Category D — Slow-Drift Fields (Tier 2 Payload)

These fields can change without reboot but do so infrequently. Sent with `POST /api/tier2` every 6 hours alongside existing tier-2 scans.

| # | Field | Source | Parse | Example Value |
|---|-------|--------|-------|---------------|
| D1 | `timezone` | `/etc/timezone`, fallback `readlink /etc/localtime` | trim, extract after `zoneinfo/` | `"UTC"`, `"America/New_York"` |
| D2 | `dns_resolvers` | `/etc/resolv.conf` | extract `nameserver` lines | `["1.1.1.1","8.8.8.8"]` |
| D3 | `dns_search` | `/etc/resolv.conf` | extract `search` line | `["example.com"]` |

### What We Explicitly Skip

These are available but not worth the complexity/cost right now:

| Data | Why Skip |
|------|----------|
| Loaded kernel modules | Noisy (50–150 items), low signal-to-noise for fleet overview |
| sysctl parameters | Too many knobs, better suited for a config-drift tool |
| User accounts (`/etc/passwd`) | Security-sensitive, parsing edge cases, better done by dedicated audit tools |
| SELinux/AppArmor status | Only meaningful on RHEL/Ubuntu respectively, adds conditional logic for little display value |
| Hugepages/NUMA/cgroup version | Niche — matters for DB tuning, not general fleet monitoring |
| Kernel cmdline | Raw string, hard to display meaningfully |
| CPU frequency governor | Not universally available (especially on VMs), unreliable reads |

## Data Flow Changes

### Probe → Worker

**Identity payload** gains optional fields:

```
IdentityPayload (existing)     IdentityPayload (new, optional)
─────────────────────────      ──────────────────────────────────
probe_version                  cpu_cores: u32
host_id                        cpu_threads: u32
hostname                       mem_total_bytes: u64
os                             swap_total_bytes: u64
kernel                         virtualization: String
arch                           machine_id: String
cpu_model                      net_interfaces: Vec<NetInterface>
uptime_seconds                 disks: Vec<BlockDevice>
boot_time                      boot_mode: String
```

**Tier 2 payload** gains optional fields:

```
Tier2Payload (existing)        Tier2Payload (new, optional)
───────────────────────        ─────────────────────────────
ports                          timezone: String
updates                        dns_resolvers: Vec<String>
systemd                        dns_search: Vec<String>
security
docker
disk_deep
```

### Worker → D1

**New D1 migration** (`0005_host_inventory.sql`):

```sql
ALTER TABLE hosts ADD COLUMN cpu_cores       INTEGER;
ALTER TABLE hosts ADD COLUMN cpu_threads     INTEGER;
ALTER TABLE hosts ADD COLUMN mem_total_bytes  INTEGER;
ALTER TABLE hosts ADD COLUMN swap_total_bytes INTEGER;
ALTER TABLE hosts ADD COLUMN virtualization   TEXT;
ALTER TABLE hosts ADD COLUMN machine_id       TEXT;
ALTER TABLE hosts ADD COLUMN net_interfaces   TEXT;  -- JSON
ALTER TABLE hosts ADD COLUMN disks            TEXT;  -- JSON
ALTER TABLE hosts ADD COLUMN boot_mode        TEXT;
ALTER TABLE hosts ADD COLUMN timezone         TEXT;
ALTER TABLE hosts ADD COLUMN dns_resolvers    TEXT;  -- JSON
ALTER TABLE hosts ADD COLUMN dns_search       TEXT;  -- JSON
```

`net_interfaces`, `disks`, `dns_resolvers`, `dns_search` are stored as JSON text in SQLite (D1). This avoids junction tables and keeps the schema flat.

The `timezone`, `dns_resolvers`, `dns_search` fields come from Tier 2 but are stored in the same `hosts` row because they describe the host, not a point-in-time snapshot.

### Worker → Dashboard

**`HostOverviewItem`** gains the same nullable fields. The hosts API query adds the new columns to its `SELECT`.

## Display Design

### Host List Card (enhanced)

Current card: hostname + status + CPU% + MEM% + uptime + last seen

Enhanced card adds a secondary info line below the title:

```
┌─────────────────────────────────────────┐
│ us2.nocoo.cloud              ● Healthy  │
│ Ubuntu 22.04 · x86_64 · 4C/8T · 8 GB   │  ← new subtitle
│                                         │
│ CPU      12.5%                          │
│ Memory   64.2%                          │
│ Uptime   14d 3h                         │
│ ─────────────────────────────────────── │
│ Last seen: just now                     │
└─────────────────────────────────────────┘
```

Subtitle format: `{os_short} · {arch} · {cores}C/{threads}T · {mem_total_formatted}`

Where:
- `os_short`: truncate PRETTY_NAME — e.g., `"Ubuntu 22.04.3 LTS"` → `"Ubuntu 22.04"`
- `mem_total_formatted`: humanize bytes — `"512 MB"`, `"8 GB"`, `"64 GB"`

### Host Detail — System Info Card (enhanced)

Add rows for the new fields:

| Label | Value |
|-------|-------|
| OS | Ubuntu 22.04.3 LTS |
| Kernel | 5.15.0-91-generic |
| Architecture | x86_64 |
| CPU | Intel Xeon E5-2680 v4 (4C/8T) |
| Memory | 8 GB |
| Swap | 2 GB |
| Virtualization | KVM |
| Boot Mode | UEFI |
| Uptime | 14d 3h |
| Boot Time | 2026-03-03 12:00:00 |
| IP Addresses | eth0: 10.0.1.5 |
| DNS | 1.1.1.1, 8.8.8.8 |
| Timezone | UTC |
| Disks | sda: 500 GB SSD |

## Implementation Phases

### Phase 1 — Low-Hanging Fruit (no probe change)

Fields S1–S4 (`cpu_cores`, `cpu_threads`, `mem_total_bytes`, `swap_total_bytes`) can be derived from `/proc/cpuinfo` and `/proc/meminfo` which the probe **already reads**. The parse functions already exist:

- `cpu::parse_cpu_count()` → S1
- `cpu::parse_cpu_model()` already reads `/proc/cpuinfo` → add sibling parsing for S2
- `memory::parse_meminfo()` → S3 (`mem_total`), S4 (`swap_total`)

### Phase 2 — New Collectors

- S5 `virtualization` — read 2 sysfs files, map known vendor strings
- S6 `machine_id` — read 1 file
- S7 `net_interfaces` — `getifaddrs()` + 2 sysfs files per interface
- S8 `disks` — iterate `/sys/block/`, read 2 files per device
- S9 `boot_mode` — 1 path existence check

### Phase 3 — Tier 2 Additions

- D1 `timezone` — read 1 file with fallback
- D2–D3 `dns_resolvers`, `dns_search` — parse `/etc/resolv.conf`

### Phase 4 — Dashboard

- Update `HostOverviewItem` to include new fields
- Enhance host card subtitle
- Enhance host detail System Info section

## Virtualization Detection Logic

```
Read /sys/class/dmi/id/sys_vendor → trim

Match:
  "QEMU"                         → "kvm"
  "Amazon EC2"                   → "aws"
  "Microsoft Corporation"        → "hyperv"
  "Google"                       → "gce"
  "DigitalOcean"                 → "digitalocean"
  "Hetzner"                      → "hetzner"
  starts with "VMware"           → "vmware"
  starts with "Xen"              → "xen"
  "innotek GmbH"                 → "virtualbox"

If /sys/class/dmi/id/sys_vendor not readable:
  Check /proc/1/cgroup for "/docker/" or "/lxc/" → "container"

Otherwise → "bare-metal"

Optionally refine with /sys/class/dmi/id/product_name for cloud instance type.
```

## Net Interface Struct

```rust
#[derive(Debug, Serialize)]
pub struct NetInterface {
    pub iface: String,
    pub mac: String,           // "aa:bb:cc:dd:ee:ff"
    pub ipv4: Vec<String>,     // ["10.0.1.5"]
    pub ipv6: Vec<String>,     // ["fe80::1"]
    pub speed_mbps: Option<i32>, // None if unreadable (virtual iface)
}
```

Exclude `lo` interface. Include all others (even those in `network.exclude_interfaces` config — that config is for traffic metrics, not identity).

## Block Device Struct

```rust
#[derive(Debug, Serialize)]
pub struct BlockDevice {
    pub device: String,           // "sda", "nvme0n1"
    pub size_bytes: u64,
    pub rotational: bool,         // true = HDD, false = SSD/NVMe
}
```

Filter: exclude `loop*`, `ram*`, `dm-*` devices. Only report whole devices.
