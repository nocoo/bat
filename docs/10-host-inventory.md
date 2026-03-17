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
3. **Backward compatible** — new fields use 2-state wire semantics: present (field exists in JSON) = update, absent (key missing) = retain old value. In Rust: `Option<T>` + `#[serde(skip_serializing_if = "Option::is_none")]`. In D1: nullable columns. In TS: `field?: T`. The probe always sends a concrete value when it has one (including empty arrays `[]` or empty strings `""` to express "nothing found"); it omits the key entirely when collection fails or is unsupported
4. **Two-tier API** — overview DTO carries only scalar summaries for list-page polling; heavy/structured inventory data (JSON arrays) is served via a separate detail endpoint

## Field Inventory

### Category S — Static Fields (Identity Payload)

These fields do not change without hardware replacement, re-provisioning, or reboot. Sent with `POST /api/identity` every 6 hours.

| # | Field | Source | Parse | Example Value |
|---|-------|--------|-------|---------------|
| S1 | `cpu_logical` | `/proc/cpuinfo` | count `^processor` lines (= logical CPUs visible to OS) | `8` |
| S2 | `cpu_physical` | `/proc/cpuinfo` | count unique (`physical id`, `core id`) pairs; fallback: parse first `cpu cores` value × distinct `physical id` count; fallback: `cpu_logical` (no HT) | `4` |
| S3 | `mem_total_bytes` | `/proc/meminfo` | `MemTotal` × 1024 | `8388608000` |
| S4 | `swap_total_bytes` | `/proc/meminfo` | `SwapTotal` × 1024 | `2147483648` |
| S5 | `virtualization` | `/sys/class/dmi/id/sys_vendor` + `product_name` | map known vendors | `"kvm"`, `"vmware"`, `"bare-metal"` |
| S6 | `net_interfaces` | `libc::getifaddrs()` + `/sys/class/net/{iface}/address` + `/sys/class/net/{iface}/speed` | per interface | `[{"iface":"eth0","mac":"aa:bb:cc:dd:ee:ff","ipv4":["10.0.1.5"],"ipv6":["fe80::1"],"speed_mbps":1000}]` |
| S7 | `disks` | `/sys/block/{dev}/size` + `/sys/block/{dev}/queue/rotational` | 512 × sectors; 0=SSD, 1=HDD | `[{"device":"sda","size_bytes":500107862016,"rotational":false}]` |
| S8 | `boot_mode` | `/sys/firmware/efi` | dir exists → `"uefi"`, else `"bios"` | `"uefi"` |

**Already collected (no change needed):** `hostname`, `os`, `kernel`, `arch`, `cpu_model`, `uptime_seconds`, `boot_time`

#### CPU Topology: `cpu_logical` vs `cpu_physical`

The existing `cpu::parse_cpu_count()` counts `^processor` lines and is labeled "CPU cores" in the codebase — this is wrong. `^processor` lines represent **logical CPUs** (hardware threads), not physical cores. On a 4-core/8-thread system, there are 8 `processor` entries.

Correct definitions:
- **`cpu_logical`** = total logical CPUs visible to the OS = count of `^processor` lines. This is what the kernel scheduler sees. Rename existing `parse_cpu_count()` comment to "logical CPUs".
- **`cpu_physical`** = physical cores (excluding HT siblings). Parse from `/proc/cpuinfo`:
  1. **Best method**: collect all (`physical id`, `core id`) pairs across all processor blocks, count unique pairs. This handles multi-socket correctly.
  2. **Fallback** (VMs that omit `physical id`/`core id`): if first `cpu cores` field exists, use `cpu_cores × socket_count` (distinct `physical id` values, default 1).
  3. **Final fallback**: if neither field exists, assume `cpu_physical == cpu_logical` (no HT).

Display format in dashboard: `"4C/8T"` means 4 physical cores, 8 logical threads.

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
| `machine_id` (`/etc/machine-id`) | Raw 32-hex identifier adds no display value. We already have `host_id` as the primary key. If dedup/merge is needed later, it can be added as a server-side-only field without exposing to the dashboard |
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
probe_version                  cpu_logical: u32
host_id                        cpu_physical: u32
hostname                       mem_total_bytes: u64
os                             swap_total_bytes: u64
kernel                         virtualization: String
arch                           net_interfaces: Vec<NetInterface>
cpu_model                      disks: Vec<BlockDevice>
uptime_seconds                 boot_mode: String
boot_time
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
ALTER TABLE hosts ADD COLUMN cpu_logical      INTEGER;
ALTER TABLE hosts ADD COLUMN cpu_physical     INTEGER;
ALTER TABLE hosts ADD COLUMN mem_total_bytes  INTEGER;
ALTER TABLE hosts ADD COLUMN swap_total_bytes INTEGER;
ALTER TABLE hosts ADD COLUMN virtualization   TEXT;
ALTER TABLE hosts ADD COLUMN net_interfaces   TEXT;  -- JSON array
ALTER TABLE hosts ADD COLUMN disks            TEXT;  -- JSON array
ALTER TABLE hosts ADD COLUMN boot_mode        TEXT;
ALTER TABLE hosts ADD COLUMN timezone         TEXT;
ALTER TABLE hosts ADD COLUMN dns_resolvers    TEXT;  -- JSON array
ALTER TABLE hosts ADD COLUMN dns_search       TEXT;  -- JSON array
```

`net_interfaces`, `disks`, `dns_resolvers`, `dns_search` are stored as JSON text in SQLite (D1). This avoids junction tables and keeps the schema flat.

### Merge Semantics (Identity + Tier 2 → hosts table)

All new fields use **2-state wire semantics** that match the existing `#[serde(skip_serializing_if)]` pattern already used throughout the codebase (e.g., `Tier2Payload` optional sections, `MetricsPayload` tier-3 fields):

| Wire state | Meaning | Worker behavior |
|------------|---------|-----------------|
| **Key present** in JSON (value is a string, number, array, or object) | Probe collected this field successfully | `UPDATE hosts SET field = ? WHERE host_id = ?` |
| **Key absent** from JSON | Probe doesn't support this field (old version), or collection failed on this run | **No-op** — retain existing value in D1 |

There is no third "explicit null" state. If the probe finds nothing (e.g., no `/etc/timezone` and no `/etc/localtime` symlink), it sends a concrete sentinel value:
- String fields: `""` (empty string)
- Array fields: `[]` (empty array)

This avoids the need to distinguish `undefined` from `null` in the wire format, which `serde(skip_serializing_if = "Option::is_none")` cannot express.

**Worker implementation**: The identity route and tier2 ingest route both gain a conditional `UPDATE hosts SET ... WHERE host_id = ?` that only includes SET clauses for keys that are actually present in the parsed JSON body. Implemented by checking `key in body` (TS) before adding each clause.

### Worker → Dashboard: Two-Tier API

The current `/api/hosts` endpoint returns `HostOverviewItem[]` and is polled every 30s by the host list page. Adding heavy JSON fields (net_interfaces, disks) to this DTO would bloat the polling payload and violate the API's "lightweight overview" responsibility.

**Solution: split into overview vs. detail.**

#### Overview DTO (`GET /api/hosts` — existing, list page, 30s polling)

Add only **scalar summary fields** to `HostOverviewItem`:

```typescript
// New fields added to HostOverviewItem
cpu_logical: number | null;
cpu_physical: number | null;
mem_total_bytes: number | null;
virtualization: string | null;
```

These are small, fixed-size, and needed by the host card subtitle. Fields like `net_interfaces`, `disks`, `timezone`, `dns_*`, `swap_total_bytes`, `boot_mode` are **NOT** added to the overview DTO.

#### Detail DTO (`GET /api/hosts/:id` — new endpoint, detail page, on-demand)

A new endpoint serves the full host inventory for a single host:

```typescript
interface HostDetailItem extends HostOverviewItem {
    swap_total_bytes: number | null;
    boot_mode: string | null;
    timezone: string | null;
    dns_resolvers: string[] | null;
    dns_search: string[] | null;
    net_interfaces: NetInterfaceDTO[] | null;
    disks: BlockDeviceDTO[] | null;
}
```

The dashboard detail page (`/hosts/[id]`) calls this endpoint once on mount (no polling — identity data is static enough).

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

Subtitle format: `{os_short} · {arch} · {physical}C/{logical}T · {mem_total_formatted}`

Where:
- `os_short`: truncate PRETTY_NAME — e.g., `"Ubuntu 22.04.3 LTS"` → `"Ubuntu 22.04"`
- `physical`/`logical`: from `cpu_physical`/`cpu_logical`
- `mem_total_formatted`: humanize bytes — `"512 MB"`, `"8 GB"`, `"64 GB"`

If `cpu_physical == cpu_logical`, display just `"4C"` (no HT). If different, `"4C/8T"`.

### Host Detail — System Info Card (enhanced)

Add rows for the new fields:

| Label | Value |
|-------|-------|
| OS | Ubuntu 22.04.3 LTS |
| Kernel | 5.15.0-91-generic |
| Architecture | x86_64 |
| CPU | Intel Xeon E5-2680 v4 (4 cores, 8 threads) |
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

### Phase 1 — CPU & Memory (probe + full stack) ✅

Fields S1–S4 reuse existing procfs reads:

- **`cpu_logical`**: Rename existing `parse_cpu_count()` to `parse_cpu_logical()` (fix misleading "cores" comment). Already works correctly — counts `^processor` lines. ✅
- **`cpu_physical`**: New `parse_cpu_physical()` — parse (`physical id`, `core id`) pairs from `/proc/cpuinfo`, count unique. Multi-socket aware. Fallback chain as described in CPU Topology section. ✅
- **`mem_total_bytes`**: Already parsed by `memory::parse_meminfo()` → `.mem_total`. ✅
- **`swap_total_bytes`**: Same → `.swap_total`. ✅

### Phase 2 — New Collectors ✅

- S5 `virtualization` — read 2 sysfs files, map known vendor strings ✅
- S6 `net_interfaces` — `getifaddrs()` + 2 sysfs files per interface ✅ (IPv6 via `/proc/net/if_inet6`, IPv4 skipped — no clean procfs source)
- S6b `public_ip` — fetch from `echo.nocoo.cloud/api/ip` every 1h, stored in identity payload ✅
- S7 `disks` — iterate `/sys/block/`, read 2 files per device ✅
- S8 `boot_mode` — 1 path existence check ✅

### Phase 3 — Tier 2 Additions ✅

- D1 `timezone` — read 1 file with fallback ✅
- D2–D3 `dns_resolvers`, `dns_search` — parse `/etc/resolv.conf` ✅
- Worker: add conditional `UPDATE hosts` in tier2 ingest route (merge semantics) ✅

### Phase 4 — Dashboard ✅

- Add scalar fields to `HostOverviewItem`, update hosts list query ✅
- New `GET /api/hosts/:id` detail endpoint with full inventory ✅
- Enhance host card subtitle ✅
- Enhance host detail System Info section (fetch from detail endpoint) ✅

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
