# 04 — Rust Probe

> Lightweight VPS monitoring agent. Collects Tier-1 metrics from procfs/sysfs and POSTs them to Worker.
> Targets: < 15 MB RSS, < 10 MB binary, < 0.1% idle CPU.
>
> Related documents:
> - [01-metrics-catalogue.md](./01-metrics-catalogue.md) — Metric definitions, procfs sources, Tier 1 + Tier 2 catalogue
> - [02-architecture.md](./02-architecture.md) — System overview, deployment steps
> - [03-data-structures.md](./03-data-structures.md) — Payload types, D1 column mapping
> - [05-worker.md](./05-worker.md) — Worker ingest endpoint that receives Probe data

---

## Config (`/etc/bat/config.toml`)

```toml
worker_url = "https://bat-ingest.worker.hexly.ai"
write_key = "your-write-key"
host_id = "jp.nocoo.cloud"    # optional, defaults to hostname
interval = 30                  # seconds

[disk]
exclude_mounts = ["/boot/efi", "/snap"]
exclude_fs_types = ["tmpfs", "devtmpfs", "squashfs"]
# NOTE: overlay is NOT excluded — per 01-metrics-catalogue.md it is a real
# filesystem used by Docker. Docker hosts need overlay mounts visible.
# Individual noisy mounts can be excluded via exclude_mounts instead.

[network]
exclude_interfaces = ["lo", "docker0"]
```

### Config path convention

The binary looks for config in this order:
1. `--config <path>` CLI argument (explicit override)
2. `/etc/bat/config.toml` (hardcoded default)

This means the systemd unit works without any flags — the binary finds `/etc/bat/config.toml` automatically.

---

## Collectors

All real-time collectors read procfs/sysfs directly — zero process fork, zero root required. Metric definitions match [01-metrics-catalogue.md § Real-Time Signals](./01-metrics-catalogue.md).

| Collector | Source | Notes |
|-----------|--------|-------|
| CPU | `/proc/stat`, `/proc/loadavg` | Delta method: two samples, diff idle/total jiffies |
| Memory | `/proc/meminfo` | Parse MemTotal, MemAvailable, SwapTotal, SwapFree |
| Disk | `/proc/mounts` + `statvfs()` | Filter by fs type, exclude configured mounts |
| Network | `/sys/class/net/*/statistics/*` | Counter → rate (bytes/sec), handle u64 wrap |
| Identity | `/etc/hostname`, `/etc/os-release`, `/proc/version`, `/proc/uptime` | Sent on startup + every 6h |

### CPU collector (`collectors/cpu.rs`)

Parses `/proc/stat` `cpu` line. Requires two samples to compute deltas:

```
cpu  user nice system idle iowait irq softirq steal guest guest_nice
```

- `usage_pct = (user + nice + system) delta / total delta × 100`
- `iowait_pct = iowait delta / total delta × 100`
- `steal_pct = steal delta / total delta × 100`

Load averages from `/proc/loadavg`: first 3 space-delimited fields.

`cpu.count` from `/proc/cpuinfo`: count `^processor` lines. Read once at startup (static value).

### Memory collector (`collectors/memory.rs`)

Parse `/proc/meminfo` for 4 keys:

```
MemTotal:        1946360 kB
MemAvailable:     562176 kB
SwapTotal:       1638380 kB
SwapFree:        1606640 kB
```

Integer value × 1024 → bytes. Compute `used_pct = (total - available) / total × 100`. Swap `used = total - free`, `used_pct = used / total × 100` (0 if no swap).

### Disk collector (`collectors/disk.rs`)

1. Read `/proc/mounts`, filter to real filesystems (`ext4`, `xfs`, `btrfs`, `overlay`)
2. Exclude configured `exclude_mounts` and `exclude_fs_types`
3. Call `statvfs()` on each surviving mount point
4. Compute `used_pct = (total - available) / total × 100`

Output: array of `{ mount, total_bytes, avail_bytes, used_pct }`.

### Network collector (`collectors/network.rs`)

Read `/sys/class/net/{iface}/statistics/{rx,tx}_{bytes,errors}` for each non-excluded interface. Packet counters (`rx_packets`, `tx_packets`) are defined in [01-metrics-catalogue.md](./01-metrics-catalogue.md) but excluded from MVP payload — bytes + errors are sufficient for alerting.

**Rate calculation** (`rate.rs`):
- **Bytes**: `rate = (current - previous) / interval_seconds` → bytes/sec (gauge)
- **Errors**: `delta = current - previous` → error count in the interval (not per-second rate, just the increment). This ensures each `metrics_raw` row records errors *during that interval*, not a cumulative counter. Hourly aggregation can safely sum these deltas.

Counters are u64 — handle wrap by treating `current < previous` as `current + (u64::MAX - previous)`.

Output: array of `{ iface, rx_bytes_rate, tx_bytes_rate, rx_errors, tx_errors }`.

### Identity collector (`collectors/identity.rs`)

| Field | Source |
|-------|--------|
| `hostname` | `/etc/hostname` (trimmed) |
| `os` | `/etc/os-release` → `PRETTY_NAME` |
| `kernel` | `/proc/version` → first token after "Linux version" |
| `arch` | `uname -m` equivalent (from `libc::uname`) |
| `cpu_model` | `/proc/cpuinfo` → `model name` (first occurrence) |
| `uptime_seconds` | `/proc/uptime` → first field (float → u64) |
| `boot_time` | `now() - uptime_seconds` |

Sent via `POST /api/identity` on startup and every 6h. Payload maps to `IdentityPayload` in [03-data-structures.md § Identity payload](./03-data-structures.md).

---

## Main Loop

```
startup → load config → build HTTP client → send identity

# Seed phase: read cpu/net counters once to establish baseline.
# Do NOT report — these raw counters have no meaningful delta yet.
seed_cpu()   → store prev jiffies
seed_net()   → store prev byte counters
wait 30s     → first interval elapses

# Normal loop: every tick has a valid prev sample to diff against
loop {
  select {
    tick(30s) → collect_all() → POST /api/ingest
                 - cpu/net deltas are now "past 30s", not "since boot"
                 - retry 5x, exponential backoff 1s→60s
                 - 401/400/403 → log error, don't retry (permanent errors)
               if 6h elapsed → resend identity
    SIGTERM/SIGINT → graceful shutdown
  }
}
```

- `tokio::main(flavor = "current_thread")` — single-threaded, minimal RSS
- **Critical**: The seed phase consumes one interval without reporting. The first actual POST happens ~30s after startup. This ensures CPU usage% and network rates reflect the real 30s window, not cumulative-since-boot values that would pollute charts and trigger false alerts.

### Permanent error handling

The Probe does NOT retry these HTTP status codes — retrying would waste resources on errors that cannot self-resolve:

| Status | Meaning | Probe action |
|--------|---------|-------------|
| `400` | Clock skew > 5 min, or invalid payload | Log error, skip this tick. Fix NTP. |
| `401` | Bad `BAT_WRITE_KEY` | Log error, skip this tick. Fix config. |
| `403` | Host is retired (`is_active = 0`) | Log error, skip this tick. Reactivate host or stop Probe. |

All other errors (5xx, network timeout, connection refused) are retried up to 5 times with exponential backoff (1s → 2s → 4s → 8s → 60s cap).

---

## Dependencies (Cargo.toml)

```toml
[dependencies]
tokio = { version = "1", features = ["rt", "time", "signal", "macros"] }
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "json"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
toml = "0.8"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

[profile.release]
opt-level = "z"
lto = true
strip = true
codegen-units = 1
```

No `sysinfo` crate — direct procfs/sysfs parsing for minimal binary size.

---

## Cross-compile Targets

- `x86_64-unknown-linux-musl` (most VPS)
- `aarch64-unknown-linux-musl` (ARM VPS)

Static musl linking ensures the binary runs on any Linux without glibc dependencies.

---

## Systemd Unit (`probe/dist/bat-probe.service`)

```ini
[Unit]
Description=bat VPS monitoring probe
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/bat-probe
# Config loaded from /etc/bat/config.toml by default (hardcoded in binary)
# Override with: ExecStart=/usr/local/bin/bat-probe --config /path/to/other.toml
Restart=always
RestartSec=5
MemoryMax=15M
# Run as dedicated user (created during install)
User=bat
Group=bat
# Probe only needs read access to /proc, /sys, /etc — no special privileges
NoNewPrivileges=true
ProtectSystem=strict
ReadOnlyPaths=/proc /sys /etc

[Install]
WantedBy=multi-user.target
```

---

## Testing Strategy (this module)

### L1 — Unit Tests (`cargo test`)

| Test file | What |
|-----------|------|
| `config.rs` | Parse valid TOML, reject invalid, default values, `--config` override |
| `payload.rs` | Serialize Rust structs to expected JSON matching `MetricsPayload` / `IdentityPayload` |
| `collectors/cpu.rs` | Parse `/proc/stat` fixture data, delta calculation, edge cases (all idle, all busy) |
| `collectors/memory.rs` | Parse `/proc/meminfo` fixture, compute used_pct, zero swap handling |
| `collectors/disk.rs` | Mount filtering logic (exclude tmpfs, exclude configured mounts, keep overlay) |
| `collectors/network.rs` | Rate calculation, u64 counter wrap handling, interface filtering |
| `collectors/identity.rs` | Parse `/etc/os-release` fixture, `/proc/version` parsing |
| `rate.rs` | Counter diff math, wrap detection, zero interval edge case |
| `sender.rs` | Retry logic (mock HTTP), permanent error detection (401/400/403), backoff timing |

**Fixture approach**: Tests use embedded string fixtures (not real `/proc` reads) to ensure determinism and cross-platform test execution.

**Coverage target**: ≥ 90% on all pure logic modules (`config`, `rate`, `collectors/*`, `payload`). `main.rs` and `sender.rs` integration paths excluded from coverage (tested via L3).

### L2 — Lint

- `cargo clippy -- -D warnings` (deny all warnings)
- `cargo fmt --check`

### L3 — Integration Test

Manual: build release binary, run against local Wrangler Worker (`pnpm --filter @bat/worker dev`), verify:
- Identity appears in D1 `hosts` table
- Metrics appear in `metrics_raw`
- Health endpoint reflects data

### L4

Not applicable — Probe is a headless daemon, no UI.

---

## Atomic Commits (this module)

| # | Commit | Files | Verify |
|---|--------|-------|--------|
| 3.1 | `feat: add config parsing` | `config.rs` | `cargo test` — parse valid/invalid TOML |
| 3.2 | `feat: add payload structs` | `payload.rs` | `cargo test` — serialize to expected JSON |
| 3.3 | `feat: add cpu collector` | `collectors/cpu.rs` | `cargo test` — parse fixture, delta calc |
| 3.4 | `feat: add memory collector` | `collectors/memory.rs` | `cargo test` — parse fixture |
| 3.5 | `feat: add disk collector` | `collectors/disk.rs` | `cargo test` — mount filtering |
| 3.6 | `feat: add network collector with rate calc` | `collectors/network.rs`, `rate.rs` | `cargo test` — rate calc, wrap handling |
| 3.7 | `feat: add identity collector` | `collectors/identity.rs` | `cargo test` — parse fixtures |
| 3.8 | `feat: add http sender with retry backoff` | `sender.rs` | `cargo test` — retry logic |
| 3.9 | `feat: add main loop with graceful shutdown` | `main.rs` | `cargo build --release`, binary < 10MB |
| 3.10 | `chore: add systemd unit file` | `dist/bat-probe.service` | Validate syntax |
| 3.11 | `test: integration test probe against local worker` | Manual test | Metrics appear in D1, health endpoint reflects data |
