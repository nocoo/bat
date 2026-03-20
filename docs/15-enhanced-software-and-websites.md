# 15 — Enhanced Software Detection & Website Discovery

## 1. Overview

Two enhancements to the Tier 2 software discovery system:

1. **Expand the software registry** — add missing software that's running on our fleet but not detected (frps, Xray, Uptime Kuma, n8n, etc.)
2. **Website discovery** — when Nginx or Apache is detected, parse their vhost configs to extract served domain names and display them in a new "Websites" section on the host detail page

### Current State

Probing 6 hosts reveals significant gaps between what's actually running and what's detected:

| Host | Purpose | Missing Software | Domains to Discover |
|------|---------|-----------------|-------------------|
| jp | frp relay | frps, frpc | — |
| us | Uptime Kuma monitoring | Uptime Kuma (Docker) | status.nocoo.cloud |
| us2 | Xray proxy | Xray | — |
| docker | Docker app platform | n8n, Portainer, Watchtower (Docker) | — |
| blog | LEMP blog | *(all detected)* | lizheng.me, phpmyadmin.blog.nocoo.cloud |
| tongji | tongji.net site | *(all detected)* | bbs.tongji.net, m.az4.infoviz.org |

Additionally, **port detection is broken** — all software shows `src=process` with empty `listening_ports`. This is likely a permissions issue after the probe was changed to run as the `bat` user (reading `/proc/net/tcp` fd symlinks requires root or `CAP_NET_ADMIN`). This needs investigation and a fix.

---

## 2. New Software Registry Entries

### 2.1 New Category: `proxy`

Add a new `SoftwareCategory` value `"proxy"` for tunneling/proxy software.

| ID | Name | Category | Ports | Process Names | Systemd Units | Binaries | dpkg |
|----|------|----------|-------|---------------|---------------|----------|------|
| frps | frp Server | proxy | 7000→frps, 7500→frps | frps | frps | frps | — |
| frpc | frp Client | proxy | — | frpc | frpc | frpc | — |
| xray | Xray | proxy | — | xray | xray | xray | — |
| v2ray | V2Ray | proxy | — | v2ray | v2ray | v2ray | — |
| clash | Clash | proxy | 7890→clash, 9090→clash | clash | clash | clash | — |

### 2.2 New Monitoring/Infra Entries

| ID | Name | Category | Ports | Process Names | Systemd Units | Binaries | dpkg |
|----|------|----------|-------|---------------|---------------|----------|------|
| uptime_kuma | Uptime Kuma | monitoring | 3001→node | — | uptime-kuma | — | — |
| umami | Umami | monitoring | 3000→node | — | — | — | — |

> Note: Uptime Kuma and Umami run as Node.js processes, making process-based detection ambiguous. Port-based detection is the primary path. Docker-image-based detection is a stretch goal (§2.4).

### 2.3 New Automation/Container Entries

| ID | Name | Category | Ports | Process Names | Systemd Units | Binaries | dpkg |
|----|------|----------|-------|---------------|---------------|----------|------|
| n8n | n8n | infra | 5678→node | — | n8n | — | — |
| portainer | Portainer | container | 9000→portainer, 9443→portainer | portainer | — | — | — |

### 2.4 Docker Image → Software Mapping (Stretch Goal)

The current architecture has a blind spot: software running inside Docker containers is invisible to the software registry because process-name matching sees `node`/`java` (generic runtime) not the application name.

**Approach**: After the standard 5-layer detection, add a 6th layer that cross-references running Docker container images against a known-image registry:

```
Image Pattern              → Software ID
louislam/uptime-kuma*      → uptime_kuma
n8nio/n8n*                 → n8n
portainer/portainer*       → portainer
containrrr/watchtower*     → watchtower
umami-software/umami*      → umami
```

This layer would:
- Only run if Docker is already detected as installed
- Reuse the Docker container list already collected by `tier2/docker.rs`
- Set `source: "docker"` and `running: true` (if container state is "running")
- Extract version from image tag when available (e.g., `n8nio/n8n:1.76.1` → version `1.76.1`)

**Files to modify**:
- `probe/src/collectors/tier2/software.rs` — add `match_by_docker_images()` and image registry
- `probe/src/collectors/tier2/docker.rs` — export the container list so software.rs can consume it
- `packages/shared/src/tier2.ts` — add `"docker"` to `source` union type

---

## 3. Website Discovery

### 3.1 Goal

When Nginx or Apache is detected on a host, parse their virtual host configuration to extract domain names. Display these in a new "Websites" panel on the host detail page.

### 3.2 Collection Strategy (Probe)

```
If Nginx detected:
  1. Read /etc/nginx/nginx.conf
  2. Read /etc/nginx/sites-enabled/* and /etc/nginx/conf.d/*.conf
  3. Extract server_name directives (regex: `server_name\s+(.+);`)
  4. Filter out: _, localhost, empty, IP addresses, commented lines

If Apache detected:
  1. Read /etc/apache2/sites-enabled/*.conf (Debian)
     OR /etc/httpd/conf.d/*.conf (RHEL/CentOS)
  2. Extract ServerName and ServerAlias directives
  3. Same filtering as above
```

**Permission model**: Nginx/Apache config files are world-readable by default (`644`). The probe running as `bat` user can read them without sudo. If a file isn't readable, silently skip it.

**Deduplication**: Multiple server blocks may reference the same domain (HTTP redirect → HTTPS). Deduplicate by domain name. Preserve the association with which web server serves it.

### 3.3 Data Structure

```rust
// probe/src/collectors/tier2/websites.rs (new file)

pub struct DiscoveredWebsite {
    pub domain: String,        // "lizheng.me"
    pub web_server: String,    // "nginx" | "apache"
    pub ssl: bool,             // true if listen 443/ssl or <VirtualHost *:443>
}

pub struct WebsiteDiscoveryData {
    pub sites: Vec<DiscoveredWebsite>,
}
```

TypeScript shared types:

```typescript
// packages/shared/src/tier2.ts

export interface DiscoveredWebsite {
  domain: string;
  web_server: "nginx" | "apache";
  ssl: boolean;
}

export interface WebsiteDiscoveryData {
  sites: DiscoveredWebsite[];
}

// Add to Tier2Payload and Tier2Snapshot:
websites?: WebsiteDiscoveryData | null;
```

### 3.4 Probe Implementation

New file: `probe/src/collectors/tier2/websites.rs`

```rust
/// Collect website domains from Nginx and Apache configs.
/// Only runs if `detected_software` contains "nginx" or "apache".
pub fn collect_websites(detected_ids: &[String]) -> Option<WebsiteDiscoveryData> {
    let has_nginx = detected_ids.iter().any(|id| id == "nginx");
    let has_apache = detected_ids.iter().any(|id| id == "apache");

    if !has_nginx && !has_apache {
        return None;
    }

    let mut sites = Vec::new();
    if has_nginx {
        sites.extend(parse_nginx_sites());
    }
    if has_apache {
        sites.extend(parse_apache_sites());
    }

    // Deduplicate by domain
    sites.sort_by(|a, b| a.domain.cmp(&b.domain));
    sites.dedup_by(|a, b| a.domain == b.domain);

    Some(WebsiteDiscoveryData { sites })
}
```

**Nginx parser**:

```rust
fn parse_nginx_sites() -> Vec<DiscoveredWebsite> {
    let mut sites = Vec::new();
    let paths = collect_nginx_config_paths();  // /etc/nginx/sites-enabled/*, /etc/nginx/conf.d/*.conf

    for path in paths {
        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,  // permission denied or missing → skip
        };
        sites.extend(extract_nginx_server_names(&content));
    }
    sites
}

fn extract_nginx_server_names(content: &str) -> Vec<DiscoveredWebsite> {
    // Parse server blocks, track listen directives for SSL detection
    // Regex: server_name\s+([^;]+);
    // Filter: skip _, localhost, IP-like patterns, commented lines
}
```

**Apache parser** (similar pattern):

```rust
fn parse_apache_sites() -> Vec<DiscoveredWebsite> {
    // Read /etc/apache2/sites-enabled/*.conf OR /etc/httpd/conf.d/*.conf
    // Extract ServerName and ServerAlias
    // SSL detection: <VirtualHost *:443> or SSLEngine on
}
```

### 3.5 Worker Storage

Website data travels in the existing Tier 2 payload. No new D1 column needed — encode as JSON within the existing `tier2_json` blob (or add `websites_json TEXT` column to `tier2_snapshots` if we want to query by domain).

**Decision**: Store in `tier2_json` blob alongside software/docker/ports/etc. This avoids a migration and keeps the tier2 data model consistent.

### 3.6 Dashboard — Websites Panel

New component: `packages/dashboard/src/components/websites-panel.tsx`

Renders below the Installed Software card in the right column of the host detail page.

```
┌────────────────────────────────────┐
│ 🌐 Websites (3)                    │
├────────────────────────────────────┤
│ 🔒 lizheng.me            nginx    │
│ 🔒 phpmyadmin.blog...    nginx    │
│ 🔓 bbs.tongji.net        nginx    │
└────────────────────────────────────┘
```

Design:
- Card with `Globe` icon from lucide-react
- Each row: lock icon (🔒 SSL / 🔓 no SSL) + domain name + web server badge
- Domain names are plain text (not links — we don't know the full URL path)
- Sorted alphabetically
- Only renders if `tier2?.websites?.sites.length > 0`

---

## 4. Port Detection Fix (Investigation)

### 4.1 Symptom

All detected software has `source: "process"` and `listening_ports: []`. Port-based detection should be populating `listening_ports` for services like Nginx (80/443), MySQL (3306), Redis (6379).

### 4.2 Root Cause Hypothesis

The probe now runs as `bat` user (not root). Port detection in `tier2/ports.rs` uses:
1. `/proc/net/tcp` — world-readable, lists all sockets with inode numbers ✅
2. `/proc/[pid]/fd/` — maps socket inodes to PIDs, but **requires root or `CAP_DAC_READ_SEARCH`** to read other processes' fd directories ❌

Without the ability to map socket → PID → process name, `ListeningPort.process` is `None`, and `match_by_ports()` skips entries without a process name.

### 4.3 Fix Options

| Option | Pros | Cons |
|--------|------|------|
| A. `ss -tlnp` command | Standard tool, shows process names | Requires `CAP_NET_ADMIN` or root for `-p` flag |
| B. Grant `CAP_DAC_READ_SEARCH` to bat-probe | Fixes fd reading | Expands probe privileges |
| C. Parse `/proc/net/tcp` inode → match from `/proc/[pid]/net/tcp6` per-pid | Works per-process | Complex, still needs /proc/[pid] access |
| D. Hybrid: read `/proc/net/tcp` for ports, match against known port→software mapping without process name | No extra privileges | Less accurate (port 80 could be any web server) |

**Recommended**: Option D (hybrid) — enhance `match_by_ports` to also match by port number alone against the registry, without requiring process name. If a port is in the registry's known ports list, it's a strong signal even without process name confirmation. This eliminates the permission problem entirely.

Fallback: if we need process-name accuracy, use Option B — add `CAP_DAC_READ_SEARCH` capability to the bat-probe binary:
```bash
sudo setcap cap_dac_read_search+ep /usr/local/bin/bat-probe
```

---

## 5. Shared Type Changes

### 5.1 New `SoftwareCategory` Value

```typescript
// packages/shared/src/tier2.ts
export type SoftwareCategory =
  | "web" | "database" | "cache" | "queue" | "runtime"
  | "monitoring" | "security" | "infra" | "container"
  | "proxy";  // NEW
```

Update dashboard `CATEGORY_LABELS` and `CATEGORY_ORDER`:
```typescript
// packages/dashboard/src/app/hosts/[id]/page.tsx
const CATEGORY_LABELS: Record<SoftwareCategory, string> = {
  // ...existing...
  proxy: "Proxies & Tunnels",
};

const CATEGORY_ORDER: SoftwareCategory[] = [
  "web", "database", "cache", "queue", "runtime",
  "container", "proxy",  // NEW — after container, before monitoring
  "monitoring", "security", "infra",
];
```

### 5.2 New Source Type

```typescript
// packages/shared/src/tier2.ts — DetectedSoftware.source
source: "port" | "process" | "systemd" | "binary" | "package" | "docker";  // add "docker"
```

### 5.3 Website Types

```typescript
export interface DiscoveredWebsite {
  domain: string;
  web_server: "nginx" | "apache" | "caddy";
  ssl: boolean;
}

export interface WebsiteDiscoveryData {
  sites: DiscoveredWebsite[];
}
```

---

## 6. Files to Modify

### Probe (Rust)

| File | Change |
|------|--------|
| `probe/src/collectors/tier2/software.rs` | Add ~10 new `SoftwareSignature` entries; add `"proxy"` category; add `match_by_docker_images()` (stretch); fix `match_by_ports` to work without process names |
| `probe/src/collectors/tier2/websites.rs` | **NEW** — Nginx/Apache vhost parser, `collect_websites()` |
| `probe/src/collectors/tier2/mod.rs` | Export `websites` module |
| `probe/src/collectors/tier2/docker.rs` | Export container list for software cross-reference (stretch) |
| `probe/src/payload.rs` | Add `websites: Option<WebsiteDiscoveryData>` to `Tier2Payload` |
| `probe/src/main.rs` | Call `collect_websites()` in `collect_tier2()`, pass result to payload |

### Shared (TypeScript)

| File | Change |
|------|--------|
| `packages/shared/src/tier2.ts` | Add `"proxy"` to `SoftwareCategory`; add `"docker"` to source; add `DiscoveredWebsite` + `WebsiteDiscoveryData` types; add `websites` to `Tier2Payload`/`Tier2Snapshot` |
| `packages/shared/src/index.ts` | Export new types |

### Worker (TypeScript)

| File | Change |
|------|--------|
| `packages/worker/src/services/tier2-ingest.ts` | Handle `websites` in tier2 payload (store in tier2_json blob) |
| `packages/worker/src/services/tier2-read.ts` | Return `websites` from tier2 snapshot |

### Dashboard (TypeScript/React)

| File | Change |
|------|--------|
| `packages/dashboard/src/app/hosts/[id]/page.tsx` | Add `"proxy"` to `CATEGORY_LABELS`/`CATEGORY_ORDER`; render `WebsitesPanel` below `SoftwareCard` |
| `packages/dashboard/src/components/websites-panel.tsx` | **NEW** — Websites card component |

---

## 7. Test Plan

### Probe Unit Tests

| Area | Tests |
|------|-------|
| New registry entries | Verify frps/xray/v2ray/n8n signatures match expected patterns |
| `match_by_ports` without process name | Port-only matching returns correct software ID |
| Nginx parser | Parse real-world nginx config with multiple server blocks, SSL, redirects, includes |
| Nginx parser edge cases | `server_name _`, localhost, IP-only, commented `server_name`, missing files |
| Apache parser | Parse `<VirtualHost>`, `ServerName`, `ServerAlias`, SSL detection |
| Website dedup | Same domain in multiple blocks → single entry |
| Docker image matching (stretch) | Known images map to correct software IDs |
| Integration | `collect_websites` only runs when nginx/apache detected |

### Worker Tests

| Area | Tests |
|------|-------|
| Tier2 ingest | Website data round-trips through JSON serialization |
| Tier2 read | `websites` field populated in API response |

### Dashboard Tests

| Area | Tests |
|------|-------|
| `CATEGORY_LABELS` | All `SoftwareCategory` values have labels |
| WebsitesPanel | Renders SSL indicators correctly |
| Empty state | Panel hidden when no websites |

---

## 8. Atomic Commits

| # | Scope | Description | Status |
|---|-------|-------------|--------|
| 1 | probe | Add new software registry entries (frps, frpc, xray, v2ray, clash, uptime_kuma, umami, n8n, portainer) + `"proxy"` category | |
| 2 | probe | Fix `match_by_ports` to support port-only matching (no process name required) | |
| 3 | shared | Add `"proxy"` to `SoftwareCategory`, `"docker"` to source, `DiscoveredWebsite` + `WebsiteDiscoveryData` types | |
| 4 | probe | Add `websites.rs` — Nginx vhost parser with `collect_websites()` | |
| 5 | probe | Add Apache vhost parser to `websites.rs` | |
| 6 | probe | Wire `collect_websites()` into `collect_tier2()` and `Tier2Payload` | |
| 7 | worker | Ingest and return `websites` in tier2 flow | |
| 8 | dashboard | Add `"proxy"` category to labels/order; add `WebsitesPanel` component | |
| 9 | probe (stretch) | Add Docker image → software mapping layer | |
| 10 | dashboard | Add `"proxy"` category to labels/order, wire WebsitesPanel into host detail | |

---

## 9. Expected Outcome

After deployment, the host detail page should show:

**jp.nocoo.cloud** — Proxies & Tunnels: `frps (running, :7000)`
**us.nocoo.cloud** — Monitoring: `Uptime Kuma (running, :3001)` + Websites: `🔒 status.nocoo.cloud (nginx)`
**us2.nocoo.cloud** — Proxies & Tunnels: `Xray (running)`
**docker.nocoo.cloud** — Infra: `n8n (running, :5678)` + Container: `Portainer (running, :9000)`
**blog.nocoo.cloud** — Websites: `🔒 lizheng.me (nginx)`, `🔒 phpmyadmin.blog.nocoo.cloud (nginx)`
**tongji.nocoo.cloud** — Websites: `🔓 bbs.tongji.net (nginx)`, `🔓 m.az4.infoviz.org (nginx)`
