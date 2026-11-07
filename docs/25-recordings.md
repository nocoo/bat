# Recorded Demo material

The default Demo catalog is built from a small number of real server and
workstation observations so that the dashboard shows genuine numeric history
instead of synthetic shapes. The raw capture never enters this repository.

## Ownership and provenance

1. The coordinator reads production API responses into a private location
   outside the checkout. Raw files, credentials and production tokens are never
   committed, copied into tests or referenced here.
2. `sanitizeRecording` in `scripts/environments/recordings.mjs` converts a raw
   capture into the normalized recording described below. It is a pure,
   dependency-free development module; no Worker, API or UI code imports it.
3. The coordinator audits the sanitized result (identifier sweep, diff review)
   before staging the JSON under the local environment fixtures directory.
4. Only the sanitized recording is checked in, and only as development fixture
   data. Automated L2/L3 lanes keep their fully synthetic fixtures.

Raw captures are never read by CI, tests or agents. Sanitizer tests use
hand-written synthetic payloads with deliberate canary strings; loader tests use
a temporary SQLite database built from the checked-in sanitized recording.

## Input contract

`sanitizeRecording(input)` accepts one object captured with an epoch `captured_at`
and these API responses:

| Key                        | Source DTO                        | Shape                            |
| -------------------------- | --------------------------------- | -------------------------------- |
| `captured_at`              | capture metadata                  | Unix seconds                     |
| `server_detail`            | `HostDetailItem`                  | `GET /api/hosts/:id`             |
| `server_raw`               | `MetricsQueryResponse`            | raw resolution, about 120 points |
| `server_hourly`            | `MetricsQueryResponse`            | hourly resolution, 24 points     |
| `server_tier2`             | `Tier2Snapshot`                   | `GET /api/hosts/:id/tier2`       |
| `server_ports`             | `AllowedPort[]`                   | port allowlist entries (about 8) |
| `server_tags`              | `HostTag[]`                       | host tags (currently empty)      |
| `workstation_detail`       | `WorkstationRecord`               | includes the latest full report  |
| `workstation_metrics`      | `WorkstationMetricsResponse`      | recent metric points             |
| `workstation_connectivity` | `WorkstationConnectivityResponse` | eight probe targets with history |

Field schemas live in `packages/shared/src/api.ts`, `identity.ts`, `tier2.ts`
and `workstations.ts`.

## Output schema

```jsonc
{
	"schema_version": 1,
	"server": {
		"detail": {}, // HostDetailItem shape, generated identifiers
		"raw": {}, // MetricsQueryResponse, disk/net/disk_io as arrays
		"hourly": {},
		"tier2": {},
		"allowed_ports": [],
		"tags": []
	},
	"workstation": {
		"detail": {}, // WorkstationRecord with sanitized latest_report
		"metrics": {},
		"connectivity": {} // targets keyed by logical server ids
	},
	"targets": [] // WorkstationTarget-like logical servers
}
```

Every absolute timestamp is replaced by a signed age in seconds:
`*_age_seconds = captured_at - value`. Values in the future are negative. The
Demo loader rebases ages onto its own initialization anchor, so history stays a
snapshot and ages naturally. `null` and zero values remain exactly as captured.

## De-identification rules

The sanitizer is a whitelist, not a scrubber. Unknown keys are dropped at every
level and no free-form string survives unchanged.

- Identity: server `host_id`, `hid`, hostname, description and maintenance
  reason are regenerated. `hid` is the FNV-1a hash of the generated `host_id`.
- Free text: OS is kept only when it matches a known distribution/version
  pattern; a Darwin numeric release becomes the fixed `macOS` label. The kernel
  only survives as its numeric version, the CPU model only as a generic label
  for the architecture, and versions only as `X.Y.Z`. Anything else becomes
  `null` or a fixed label. Process `cmd` is the process name, never an argument
  vector; users are an allowlisted service account or `demo`. Tag ids are
  replaced by their 1-based position and tag names by `tag-NN`.
- Services and containers: process and software names are allowlisted;
  anything else becomes `service-NN`. Systemd units become `service-NN.service`
  with generic descriptions, container ids/names/images become
  `demo-NN`/`container-NN`/`example.test/image-NN:1`, and container status is
  derived from its state.
- Addresses: IPv4 becomes `203.0.113.0/24`, IPv6 becomes `2001:db8::/32`;
  wildcard and loopback addresses are preserved. IPv6 zone identifiers are
  stripped before validation and canonical output is lowercase. MAC addresses
  become locally administered `02:00:00:00:00:XX` values. Every domain becomes
  `site-NN.example.test`. Diagnostics URLs contain no credentials or query
  strings.
- Structure: interfaces, block devices, mounts and disk-deep paths are mapped
  deterministically across detail, history and identity. Unknown mounts and
  paths become `/mnt/data-NN` and `/var/lib/demo-NN`. PIDs and PPIDs are
  remapped consistently, with PID 1 preserved.
- Raw tables: `disk_json`, `net_json`, `disk_io_json` and
  `top_processes_json` are parsed as JSON and rebuilt from whitelisted fields.
  Malformed values and embedded unknown keys become empty arrays or are
  dropped.
- Workstations: ids, owner and names are replaced with the canonical demo
  identity, and the report receipt time becomes `received_at_age_seconds`.
  Connectivity server ids are mapped to sorted logical ids `server-01`..`server-08`.
  Target address and family come from the latest report, with the connectivity
  history as fallback; an entry without usable metadata keeps a null address
  rather than a fabricated default. All eight aliases are instantiated from the
  single captured server template at load time. A single workstation is captured.

Explicitly never preserved: real hostnames, hashes, UUIDs, host or workstation
ids, owner emails, public or private addresses, MACs, DNS names, search domains,
user names, home paths, process arguments, descriptions, container ids, images,
labels and arbitrary error strings. Collection and target errors are replaced by
generic messages; their presence is preserved rather than fabricated away.

## Tests

```sh
bun test scripts/environments/recordings.test.mjs scripts/environments/recorded-demo.test.mjs
```

The sanitizer suite covers unknown keys, embedded JSON tables, malicious nested fields,
free-form commands, canary tokens, source ids, reserved address ranges, MACs,
time rebasing, null/failure preservation and cross-references between detail,
history, tier 2, workstation and targets. The loader suite applies every
production migration to `:memory:`, seeds the recording at two anchors, and
checks alias sharing, reserved identities, SQL column mapping, NULL maxima,
zero/null preservation, one workstation, eight target links, exact latest RTTs,
reconstructed older aggregates, fail-closed validation and the unchanged focused
catalog.

## Local Demo loading

`scripts/environments/recorded-demo.mjs` is the only consumer that turns a
recording into SQL. It validates `schema_version: 1`, every required section and
the eight logical target ids before emitting anything, so a malformed recording
fails closed instead of seeding a partial store. It is offline: no sanitizer,
raw capture, production token or remote binding is read.

The default Demo catalog (fixture version 3) seeds fresh owned stores only:

- `server-01` and `server-02` keep the reserved `pw-host-alpha` and
  `pw-host-beta` ids used by capture routes; `server-03`..`server-08` use
  `demo-server-03`..`demo-server-08`. Hostnames are `alpha.example.test`,
  `beta.example.test` and `server-03.example.test`..`server-08.example.test`.
- All eight aliases share the single captured server template: CPU and memory
  inventory, disks, 120 raw points, 24 hourly points, one tier 2 snapshot, the
  process snapshot and network/disk history are identical. Host identity,
  hostname, public documentation address and interface addresses are synthetic
  per alias. Public addresses come from the recorded target list and match the
  workstation connectivity rows.
- Raw points map only to real `metrics_raw` columns. `disk`, `net` and
  `disk_io` become their JSON columns. Computed raw aliases such as
  `net_rx_bytes_avg`, maxima, and `sample_count` do not exist in `metrics_raw`
  and are not invented.
- Hourly points map captured averages to the real aggregate columns
  (`cpu_usage_pct` to `cpu_usage_avg`, `mem_available` to `mem_available_min`,
  `swap_used` to `swap_used_max`, `uptime_seconds` to `uptime_min`, and so on).
  Aggregate maxima that the hourly API never exposed stay `NULL`; hourly disk
  I/O aggregates are also `NULL` because the sanitized shape does not retain
  them. Known `ext_json` signals are rebuilt from the captured values only.
- The Demo catalog has one workstation with the canonical recorded id
  `00000000-0000-4000-8000-000000000001`. Its credential columns contain a
  locally derived, non-usable fixture hash and the `batw_fixture` prefix, never
  a captured key.
- Four report points come from the captured metric history. The newest report
  stores the complete captured payload, including its exact three-value RTT
  tuples, zeros, nulls and genuine failure statuses. The three older reports
  store the captured scalar metric columns and connectivity rows.
- Older connectivity history only exposes `received`, `status`,
  `rtt_avg_ms`, `rtt_min_ms` and `rtt_max_ms`. Their three-packet storage order
  was never captured. The loader rebuilds a tuple that preserves those
  aggregates (a timeout stays three nulls; one or two replies keep the reported
  count) and its origin is documented here rather than presenting it as the
  original packet order. Older payload copies retain the captured scalar
  metrics and omit inventory sections that were not captured per point.

Every `*_age_seconds` value becomes `anchor - age`; absolute source epochs are
never stored. The anchor is the fresh store's initialization epoch, so Demo
history is a snapshot that ages naturally. No replay daemon, keepalive or
synthetic freshness clock is involved: no sample is ever invented or restamped.

A snapshot that ages past its windows would show empty charts, so the local
launcher re-seeds a Demo store older than `DEMO_FRESH_SECONDS` (30 minutes) — at
startup and, for a long running gateway, on a minute tick that swaps the runtime
behind the existing instance id. The store is rebuilt from the checked-in
recording; captured CRUD edits made in the Demo are disposable, while the
sanitized catalog stays the only source of the shapes. The isolated capture fixes only its
Playwright page clock to the runtime anchor for deterministic host comparisons;
it does not change the Demo runtime clock or seeded ages.

The focused synthetic catalog (`alpha.test.local`, `beta.test.local`, four
synthetic workstations) remains byte-for-byte independent and continues to feed
the automated L2/L3 suites. The recorded catalog is exercised by the isolated
rich Demo acceptance (`verify.mjs`, `capture.mjs`), not by focused Playwright
fixtures.
