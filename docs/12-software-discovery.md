# 12 — Software Discovery (Tier 2 Collector)

## Overview

Probe automatically detects common software installed and running on the host. This provides a "purpose at a glance" view: users can instantly see that a host runs Nginx, PostgreSQL, Redis, Docker, etc., without manually checking.

Data enters the **6-hour (Tier 2) bucket** alongside ports, updates, systemd, security, docker, and disk scans.

---

## Detection Strategy

Software detection uses multiple signals combined. No single method catches everything — combining them maximizes coverage while keeping I/O minimal.

### Signal Sources (checked in order)

| # | Method | What it catches | Cost |
|---|--------|----------------|------|
| 1 | **Listening ports** (already collected) | Network services by well-known port → process name | Free (reuse `ports.listening`) |
| 2 | **Running processes** (`/proc/*/comm` + `/proc/*/cmdline`) | All actively running software | Cheap procfs scan |
| 3 | **Systemd units** (`systemctl list-unit-files --type=service`) | Installed services even if not running | One subprocess |
| 4 | **Binary probing** (`which` / path existence) | CLI tools, runtimes, not-running-right-now software | ~20 stat() calls |
| 5 | **Package manager** (dpkg-query for key packages) | Installed but no service/binary in PATH | One subprocess |

### Detection Flow

```
┌─────────────────────────────────┐
│  1. Reuse tier2::ports result   │──→ port 5432 + process "postgres" → PostgreSQL
│  2. Scan /proc/*/comm           │──→ "redis-server" → Redis
│  3. systemctl list-unit-files   │──→ "nginx.service enabled" → Nginx
│  4. which/stat known paths      │──→ /usr/bin/node exists → Node.js
│  5. dpkg-query (selected pkgs)  │──→ "openssh-server installed" → OpenSSH
└─────────────────────────────────┘
            │
            ▼
    Deduplicate by software ID
            │
            ▼
    DetectedSoftware[]
```

### Software Registry (hardcoded in probe)

A static lookup table of ~40 common software items, each with:

```rust
struct SoftwareSignature {
    id: &'static str,          // unique key: "nginx", "postgres", "redis"
    name: &'static str,        // display: "Nginx", "PostgreSQL", "Redis"
    category: Category,        // web, database, cache, runtime, monitoring, security, infra
    detect: DetectRules,       // which signals to check
}

struct DetectRules {
    ports: &'static [(u16, &'static str)],     // (port, process_name_prefix)
    process_names: &'static [&'static str],     // /proc/*/comm matches
    systemd_units: &'static [&'static str],     // unit file name patterns
    binary_paths: &'static [&'static str],      // absolute paths or bare names for `which`
    dpkg_names: &'static [&'static str],        // debian package names
}
```

### Initial Software List (~40 items)

**Web servers & reverse proxies:**
- Nginx (`nginx`, port 80/443, unit `nginx.service`)
- Apache (`apache2`/`httpd`, port 80/443)
- Caddy (`caddy`, unit `caddy.service`)
- Traefik (`traefik`, port 80/443/8080)
- HAProxy (`haproxy`, port 80/443)

**Databases:**
- PostgreSQL (`postgres`, port 5432)
- MySQL/MariaDB (`mysqld`/`mariadbd`, port 3306)
- MongoDB (`mongod`, port 27017)
- SQLite3 (binary only, no service)
- ClickHouse (`clickhouse-server`, port 8123/9000)

**Caches & message queues:**
- Redis (`redis-server`, port 6379)
- Memcached (`memcached`, port 11211)
- RabbitMQ (`rabbitmq-server`, port 5672)
- Kafka (`kafka`, port 9092)
- NATS (`nats-server`, port 4222)

**Runtimes & languages:**
- Node.js (`node`, binary)
- Python 3 (`python3`, binary)
- Go (`go`, binary)
- Rust (`rustc`, binary)
- Java/JRE (`java`, binary)
- PHP (`php`/`php-fpm`, process/binary)
- Ruby (`ruby`, binary)
- Bun (`bun`, binary)
- Deno (`deno`, binary)

**Container & orchestration:**
- Docker (already detected via tier2::docker, reference only)
- Podman (`podman`, binary/socket)
- containerd (`containerd`, process)
- k3s (`k3s`, process/unit)

**Monitoring & observability:**
- Prometheus (`prometheus`, port 9090)
- Grafana (`grafana-server`, port 3000)
- node_exporter (`node_exporter`, port 9100)
- Zabbix agent (`zabbix_agentd`, port 10050)

**Security:**
- fail2ban (already in security collector, reference only)
- CrowdSec (`crowdsec`, process/unit)
- WireGuard (`wg`, interface/unit)
- OpenVPN (`openvpn`, process/unit)

**Infrastructure:**
- OpenSSH server (`sshd`, port 22)
- Cron (`cron`/`crond`, process)
- systemd-resolved (`systemd-resolved`, process)
- dnsmasq (`dnsmasq`, port 53)
- Postfix (`postfix`/`master`, port 25)
- certbot (binary only)

---

## Probe Implementation

### New module: `probe/src/collectors/tier2/software.rs`

```rust
pub struct DetectedSoftware {
    pub id: String,
    pub name: String,
    pub category: String,
    pub version: Option<String>,       // best-effort, filled async after core detection
    pub source: String,                // how detected: "port", "process", "systemd", "binary", "package"
    pub running: bool,                 // is it actively running right now?
    pub listening_ports: Vec<u16>,     // associated open ports (from ports scan)
}

pub struct SoftwareDiscoveryData {
    pub detected: Vec<DetectedSoftware>,
    pub scan_duration_ms: u64,         // core detection time (signals 1-5)
    pub version_duration_ms: u64,      // version probing time (async, capped at 3s)
}
```

**Version detection** is best-effort:
- For binaries: run `<binary> --version` with 2s timeout, parse first line
- For packages: `dpkg-query -W -f '${Version}' <pkg>` with 2s timeout
- If both fail: `version = None`

**Process scan** is a single `/proc` traversal:
- Read all `/proc/[pid]/comm` files (similar to existing `build_inode_pid_map`)
- Collect unique process names into a `HashSet<String>`
- Match against registry entries

**Systemd scan**:
- `systemctl list-unit-files --type=service --no-legend --plain` → parse unit names
- Match `unit_name.strip_suffix(".service")` against registry

### Integration into Tier 2 flow

In `main.rs::collect_tier2()`:
```rust
// After existing collectors, add:
let software = collectors::tier2::software::collect_software_discovery(
    ports_payload.as_ref()  // reuse already-collected ports data
).await;
```

The software collector receives the already-collected `ServicePortsData` to avoid re-scanning ports.

### Performance budget

**Core detection** (signals 1–5, excluding version probing):
- Target: **< 500ms** total scan time (no network I/O, all local).
- `/proc/*/comm` scan: ~10ms (same as ports inode scan)
- `systemctl list-unit-files`: ~50ms
- Binary stat() probes: ~5ms (20 stat calls)
- dpkg-query: ~100ms
- Total typical: ~200ms.

**Version probing** (separate, runs after core detection completes):
- Runs concurrently for all detected software, with a **global 3s timeout** via `tokio::time::timeout`.
- Up to 15 concurrent `<binary> --version` subprocesses, each with individual 2s timeout.
- Version results are best-effort: if the global timeout fires, any still-pending versions are set to `null`.
- Version probing does NOT block the `DetectedSoftware` list — the list is assembled first (with `version: None`), then versions are filled in asynchronously.

**Total worst case**: ~3.5s (500ms detection + 3s version probing). Acceptable for a 6-hour cycle that already runs `du`, `find`, and `docker inspect` taking 10–30s. The `scan_duration_ms` field in the response separates core detection time from version probing time:

```rust
pub struct SoftwareDiscoveryData {
    pub detected: Vec<DetectedSoftware>,
    pub scan_duration_ms: u64,          // core detection only
    pub version_duration_ms: u64,       // version probing only
}
```

---

## Shared Types (`packages/shared/src/tier2.ts`)

```typescript
// --- Software Discovery (2.7) ---

export interface DetectedSoftware {
  id: string;              // "nginx", "postgres", "redis"
  name: string;            // "Nginx", "PostgreSQL", "Redis"
  category: SoftwareCategory;
  version: string | null;
  source: "port" | "process" | "systemd" | "binary" | "package";
  running: boolean;
  listening_ports: number[];
}

export type SoftwareCategory =
  | "web"
  | "database"
  | "cache"
  | "queue"
  | "runtime"
  | "monitoring"
  | "security"
  | "infra"
  | "container";

export interface SoftwareDiscoveryData {
  detected: DetectedSoftware[];
  scan_duration_ms: number;          // core detection only
  version_duration_ms: number;       // version probing only
}
```

Extend `Tier2Payload`:
```typescript
software?: SoftwareDiscoveryData;
```

Extend `Tier2Snapshot`:
```typescript
software: SoftwareDiscoveryData | null;
```

---

## Worker Changes

### Migration `0011_software_column.sql`

```sql
ALTER TABLE tier2_snapshots ADD COLUMN software_json TEXT;
```

Single column, same pattern as other tier2 JSON columns.

### Ingest (`tier2-ingest.ts`)

- Accept `software` field from `Tier2Payload`
- Serialize to `software_json` in INSERT

### Read (`tier2-read.ts`)

- Parse `software_json` back to `SoftwareDiscoveryData`
- Include in `Tier2Snapshot` response

### Dashboard read path

The Dashboard reads software data via the **existing** `GET /api/hosts/:id/tier2` route (already registered in the worker, authenticated with `BAT_READ_KEY`). This route returns the latest `Tier2Snapshot` which will now include the `software` field.

Dashboard proxy route already exists or needs to be added:

| Dashboard route file | Method | Proxies to Worker | Status |
|---------------------|--------|-------------------|--------|
| `/api/hosts/[id]/tier2/route.ts` | GET | `GET /api/hosts/:id/tier2` | **New** — must be added as a dashboard proxy route |

The host detail page (`/hosts/[id]`) will call this proxy route to fetch tier2 data (including software). Currently the host detail page only renders Tier 1 metrics charts; the tier2 API exists on the worker side but has no corresponding dashboard proxy or UI — both must be added as part of this feature.

### Hosts list enrichment (optional, Phase 2)

Add `software_summary` to `HostOverviewItem` — array of software IDs from latest tier2 snapshot. Enables host card to show software icons. This is a subsequent commit, not part of the core feature.

---

## Dashboard UI

### Host detail page — Tier 2 section

New card: **"Installed Software"**
- Grid of software items, grouped by category
- Each item: icon (emoji or simple SVG) + name + version + status dot (running/installed)
- Category headers: Web, Database, Cache, Runtime, etc.
- Listening ports shown as small badge next to running services

### Host card (hosts page) — Phase 2

- Show top 3–5 software icons as small grayscale logos below the tag chips
- Provides instant "this is a web server + database" visual signal

---

## Commits (estimated 6)

1. `feat: add software discovery collector to probe` — registry, process scan, systemd scan, binary probe, two-phase version detection
2. `test: add software discovery unit tests` — mock procfs, systemd output parsing, registry matching, version timeout behavior
3. `feat: add software_json column and ingest/read support` — migration + worker tier2 ingest/read changes
4. `feat: add shared types for software discovery` — TypeScript types in `@bat/shared` (tier2.ts + api.ts)
5. `feat: add tier2 proxy route and software UI to host detail` — dashboard proxy `/api/hosts/[id]/tier2/route.ts` + "Installed Software" card on host detail page
6. `feat: add software summary to host cards` — Phase 2: software icons on host overview cards

---

## Future Extensions

- **Custom software definitions**: Allow users to define custom software signatures via config (probe-side `config.toml` or worker-side API)
- **Software alerts**: "PostgreSQL stopped running" (Tier 2 alert rule comparing current vs previous snapshot)
- **Software inventory page**: Cross-fleet view — "which hosts run Redis?" (filterable table)
- **Auto-tagging**: Suggest tags based on detected software (e.g. host running PostgreSQL → suggest `database` tag)
