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

This is a **best-effort parser**, not a full config syntax analyzer. Nginx and Apache configs support `include` directives, nested blocks, conditionals, and Lua/mod_rewrite that a regex-based parser cannot fully resolve. The goal is to extract domain names from the ~90% of standard vhost configurations that follow common patterns, and silently skip configurations that are too complex.

**Nginx parser** — per-block state machine:

```
1. Read /etc/nginx/sites-enabled/* and /etc/nginx/conf.d/*.conf
   (NOT nginx.conf itself — it typically only has include directives and http{} globals)
2. For each file, track state per server{} block:
   - On `server {`  → enter block, reset ssl=false
   - On `listen ... ssl` or `listen 443` → mark ssl=true for current block
   - On `server_name <names>;` → record names for current block
   - On `}` at top-level nesting → emit (names, ssl) pair, exit block
3. Filter each name: skip _, localhost, empty, IP-like (regex: ^\d+\.\d+\.\d+\.\d+$)
4. Do NOT follow include directives (would require recursive resolution)
```

**Apache parser** — per-VirtualHost state machine:

```
1. Read /etc/apache2/sites-enabled/*.conf (Debian)
   OR /etc/httpd/conf.d/*.conf (RHEL/CentOS)
2. Track state per <VirtualHost> block:
   - On `<VirtualHost *:443>` or `SSLEngine on` → mark ssl=true
   - On `ServerName <name>` → record primary domain
   - On `ServerAlias <names>` → record additional domains
   - On `</VirtualHost>` → emit and reset
3. Same name filtering as Nginx
```

**Limitations** (documented, accepted):
- Does not follow `include` directives — sites defined in non-standard paths will be missed
- Cannot parse Lua-generated or dynamically-templated configs
- SSL detection is heuristic: `listen 443`, `listen ... ssl`, `SSLEngine on`
- Brace/block counting is naive — deeply nested `if{}` blocks inside `server{}` may confuse the parser

**Permission model**: Nginx/Apache config files are world-readable by default (`644`). The probe running as `bat` user reads them without sudo. If a file isn't readable, it is silently skipped. **This is a best-effort scan of standard config paths only** — the dashboard should present results accordingly (see §3.6).

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
/// Best-effort: reads standard config paths, skips unreadable files,
/// does not follow include directives.
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

    // Deduplicate by domain (keep ssl=true if any block serves it with SSL)
    sites.sort_by(|a, b| a.domain.cmp(&b.domain));
    sites.dedup_by(|a, b| {
        if a.domain == b.domain {
            b.ssl = b.ssl || a.ssl; // merge: if either has SSL, keep SSL
            true
        } else {
            false
        }
    });

    Some(WebsiteDiscoveryData { sites })
}
```

**Nginx parser** — block-tracking state machine:

```rust
fn parse_nginx_sites() -> Vec<DiscoveredWebsite> {
    let mut sites = Vec::new();
    // Scan standard config dirs — do NOT follow include directives
    let paths = glob_config_files(&[
        "/etc/nginx/sites-enabled/*",
        "/etc/nginx/conf.d/*.conf",
    ]);

    for path in paths {
        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,  // permission denied or missing → skip
        };
        sites.extend(extract_nginx_server_blocks(&content));
    }
    sites
}

/// Parse server{} blocks from Nginx config content.
/// Tracks brace nesting to associate server_name with listen directives.
fn extract_nginx_server_blocks(content: &str) -> Vec<DiscoveredWebsite> {
    // State machine:
    // - Track brace depth; server{} starts at depth 1
    // - Within a server block, collect `listen` directives for SSL detection
    // - Collect `server_name` directive for domain names
    // - On block close, emit (names × ssl) pairs
    // - Skip commented lines (leading #)
}
```

**Apache parser** — VirtualHost block tracking:

```rust
fn parse_apache_sites() -> Vec<DiscoveredWebsite> {
    // Scan standard config dirs for both Debian and RHEL layouts
    let paths = glob_config_files(&[
        "/etc/apache2/sites-enabled/*.conf",
        "/etc/httpd/conf.d/*.conf",
    ]);
    // For each file, track <VirtualHost> blocks
    // Extract ServerName, ServerAlias, SSL detection (*:443 or SSLEngine on)
}
```

### 3.5 Worker Storage

Website data travels in the existing Tier 2 payload. The current storage model uses **per-section columns** in `tier2_snapshots` (e.g., `ports_json`, `software_json`, `docker_json` — each a nullable TEXT column holding JSON). Following this pattern, we add a new column:

```sql
-- migrations/0016_websites.sql
ALTER TABLE tier2_snapshots ADD COLUMN websites_json TEXT;
```

The insert and read queries in `packages/worker/src/services/tier2-metrics.ts` (`insertTier2Snapshot` / `getLatestTier2Snapshot`) must be updated to include the new column, following the same `JSON.stringify()` / `safeParse()` pattern as `software_json`.

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
- Footer note in muted text: "Discovered from standard Nginx/Apache config paths" — signals to the user that this is best-effort, not exhaustive

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

**Recommended**: Option B — grant `CAP_DAC_READ_SEARCH` to the bat-probe binary. This is the minimal privilege escalation needed to restore correct fd→inode→process mapping. Add to `install.sh` post-install step:

```bash
sudo setcap cap_dac_read_search+ep /usr/local/bin/bat-probe
```

This capability only allows reading directory entries in `/proc/[pid]/fd/` — it does not grant write access, ptrace, or any other privilege. The probe's existing systemd hardening (`NoNewPrivileges=true`, `ProtectSystem=strict`) remains in effect.

> Note: `NoNewPrivileges=true` in the systemd unit would prevent `setcap` from taking effect. The unit file must use `AmbientCapabilities=CAP_DAC_READ_SEARCH` instead, or remove `NoNewPrivileges=true`.

**Rejected alternative** (Option D — port-only matching without process name): Too many false positives on generic ports. Port 80/443 could be Nginx, Apache, Caddy, or a random app; port 3000 could be Grafana, Umami, or any Node.js app; port 9000 could be ClickHouse or Portainer. Without process-name confirmation, this would systematically produce incorrect software identifications.

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
  web_server: "nginx" | "apache";
  ssl: boolean;
}

export interface WebsiteDiscoveryData {
  sites: DiscoveredWebsite[];
}
```

> Note: Caddy uses a Caddyfile format with implicit HTTPS. If Caddy vhost parsing is needed in the future, add `"caddy"` to the union type then. This version only covers Nginx and Apache.

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
| `packages/worker/migrations/0016_websites.sql` | **NEW** — `ALTER TABLE tier2_snapshots ADD COLUMN websites_json TEXT` |
| `packages/worker/src/services/tier2-metrics.ts` | Add `websites_json` to `insertTier2Snapshot()` INSERT and `getLatestTier2Snapshot()` SELECT; `JSON.stringify()` / `safeParse()` |
| `packages/worker/src/routes/tier2-ingest.ts` | Pass `payload.websites` through to `insertTier2Snapshot()` |
| `packages/worker/src/routes/tier2-read.ts` | Include `websites` in API response from `getLatestTier2Snapshot()` result |
| `packages/worker/src/test-helpers/mock-d1.ts` | Add migration path for 0016 |
| `packages/worker/test/e2e/wrangler.test.ts` | Add `"migrations/0016_websites.sql"` to E2E migration list |

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
| 2 | probe | Fix port detection: grant `CAP_DAC_READ_SEARCH` via systemd `AmbientCapabilities`, update `install.sh` and unit file | |
| 3 | shared | Add `"proxy"` to `SoftwareCategory`, `"docker"` to source, `DiscoveredWebsite` + `WebsiteDiscoveryData` types | |
| 4 | probe | Add `websites.rs` — Nginx vhost block parser with `collect_websites()` | |
| 5 | probe | Add Apache vhost parser to `websites.rs` | |
| 6 | probe | Wire `collect_websites()` into `collect_tier2()` and `Tier2Payload` | |
| 7 | worker | D1 migration `0016_websites.sql` + ingest/read `websites_json` column in `tier2-metrics.ts` | |
| 8 | dashboard | Add `"proxy"` category to labels/order; add `WebsitesPanel` component with best-effort footer | |
| 9 | dashboard | Wire `WebsitesPanel` into host detail page | |
| 10 | probe (stretch) | Add Docker image → software mapping layer | |

---

## 9. Expected Outcome

After deployment, the host detail page should show:

**jp.nocoo.cloud** — Proxies & Tunnels: `frps (running, :7000)`
**us.nocoo.cloud** — Monitoring: `Uptime Kuma (running, :3001)` + Websites: `🔒 status.nocoo.cloud (nginx)`
**us2.nocoo.cloud** — Proxies & Tunnels: `Xray (running)`
**docker.nocoo.cloud** — Infra: `n8n (running, :5678)` + Container: `Portainer (running, :9000)`
**blog.nocoo.cloud** — Websites: `🔒 lizheng.me (nginx)`, `🔒 phpmyadmin.blog.nocoo.cloud (nginx)`
**tongji.nocoo.cloud** — Websites: `🔓 bbs.tongji.net (nginx)`, `🔓 m.az4.infoviz.org (nginx)`
