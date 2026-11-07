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

Raw captures are never read by CI, tests or agents. Tests use hand-written
synthetic payloads with deliberate canary strings.

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
bun test scripts/environments/recordings.test.mjs
```

The suite covers unknown keys, embedded JSON tables, malicious nested fields,
free-form commands, canary tokens, source ids, reserved address ranges, MACs,
time rebasing, null/failure preservation and cross-references between detail,
history, tier 2, workstation and targets.

## Local Demo loading

The recording is consumed only by the local environment loader for the default
Demo catalog. The existing `pw-host-alpha` and `pw-host-beta` ids remain reserved
for capture scripts, focused and E2E fixtures stay synthetic, and no scheduling,
deployment or production API code is involved.
