# 24 — Workstations

A **workstation** is the user's own laptop or desktop, monitored by the `bat` CLI instead of the
server probe. It uploads host capacity and reachability snapshots for the Bat servers it is allowed
to see. It is not a server host and has no process list, remote shell, metrics ingest lane or alert
rules.

Source of truth for every type, limit and pure helper: `packages/shared/src/workstations.ts`.
Worker implementation: `packages/worker/src/{routes,middleware,services,domain,adapters/d1}/workstation*`,
migration `0031_workstations.sql`.

## Protocol constants

| Constant                                 | Value     | Meaning                                               |
| ---------------------------------------- | --------- | ----------------------------------------------------- |
| `WORKSTATION_INTERVAL_SECONDS`           | `600`     | One collection cycle every ten minutes                |
| `WORKSTATION_PING_COUNT`                 | `3`       | Probes per connectivity target                        |
| `WORKSTATION_MAX_TARGETS`                | `100`     | Targets per cycle and connectivity entries per report |
| `WORKSTATION_BODY_MAX_BYTES`             | `65536`   | Streamed body ceiling (64 KiB), enforced before JSON  |
| `WORKSTATION_REPORT_SKEW_SECONDS`        | `300`     | Accepted distance between `finished_at` and receipt   |
| `WORKSTATION_MAX_RUN_MS`                 | `120000`  | Hard ceiling for one collection run                   |
| `WORKSTATION_STALE_AFTER_SECONDS`        | `1800`    | Three intervals without a report = stale              |
| `WORKSTATION_AUTH_CODE_TTL_SECONDS`      | `300`     | One-time PKCE code lifetime                           |
| `WORKSTATION_HISTORY_MAX_LIMIT`          | `100`     | Maximum history page size                             |
| `WORKSTATION_HISTORY_MAX_WINDOW_SECONDS` | `2592000` | 30 day history window ceiling                         |

Field bounds live in `WORKSTATION_LIMITS`; per-key limits in `WORKSTATION_RATE_LIMITS`
(`reportsPerMinute: 2`, `targetsPerMinute: 6`, `exchangePerTenMinutes: 5`). The local harness may
raise those limits with `WORKSTATION_RATE_LIMIT`; production ignores the override.

## Endpoints

| Method and path                           | Auth                          | Result                                                     |
| ----------------------------------------- | ----------------------------- | ---------------------------------------------------------- |
| `POST /api/workstation-auth/authorize`    | Access session, `email:` only | `201 { redirect_url }`, same-origin POST after consent     |
| `POST /api/workstation-auth/exchange`     | PKCE code + verifier          | `200 WorkstationLoginExchangeOutput`                       |
| `GET /api/workstation-probe/targets`      | `batw_` Bearer                | `WorkstationTargetsResponse`                               |
| `POST /api/workstation-probe/reports`     | `batw_` Bearer                | `200 WorkstationReportAccepted`, `409` on content mismatch |
| `GET /api/workstations`                   | Access session                | `WorkstationRecord[]`                                      |
| `GET /api/workstations/{id}`              | Access session                | `WorkstationRecord`                                        |
| `GET /api/workstations/{id}/metrics`      | Access session                | `WorkstationMetricsResponse`                               |
| `GET /api/workstations/{id}/connectivity` | Access session                | `WorkstationConnectivityResponse`                          |
| `DELETE /api/workstations/{id}`           | Access session + confirmation | `{ ok: true }`, owner or global manager                    |

Machine-endpoint whitelist (`bat-ingest.worker.hexly.ai`) contains exactly the exchange, the two
probe routes and `revoke`. The consent POST and every browser read/delete are browser-only and are rejected on the
machine hostname. There is **no GET mint path**: the consent step is a same-origin POST that returns
`redirect_url`.

## Enrollment

`POST /api/workstation-auth/authorize` requires a verified Access session whose principal is
`email:<address>`; service principals are refused. It also requires `Origin` equal to the request
origin and `X-Bat-Management: 1`. The body is `WorkstationAuthorizeInput`:

| Field                   | Rules                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `installation_id`       | UUID, random and stable per machine                                                               |
| `code_challenge`        | 43 character base64url S256 digest                                                                |
| `code_challenge_method` | exactly `S256`                                                                                    |
| `state`                 | 16–128 characters of `A-Za-z0-9._~-` verified by the CLI                                          |
| `callback`              | loopback only, http or https, path exactly `/callback`, no credentials, fragment or pre-set query |
| `name`                  | optional display name, 1–64 characters, defaults to `Workstation`                                 |

`redirect_url` is the callback plus `code` and `state`. Codes are stored as SHA-256 digests, expire
after five minutes, and are single use.

`POST /api/workstation-auth/exchange` accepts `WorkstationLoginExchangeInput`
(`code`, `code_verifier`, `installation_id`) and answers
`{ workstation_id, token, worker_url }`. One atomic batch consumes the code, registers or rotates the
workstation keyed by the unique installation ID, and never revives a deleted or disabled workstation.
`workstation_id` is the server UUID; it is returned separately and never derived from the
installation ID or the key. Re-enrollment keeps the installation ID, keeps the workstation ID, bumps
`version`, and replaces the key.

## Keys and limits

- Keys are `batw_` plus 43 base64url characters (256 random bits). D1 stores only the SHA-256 hex
  digest; the plaintext appears once in the exchange response.
- A key authenticates exactly one workstation. Static probe keys, CLI asset tokens, Access cookies
  and Connect Bearer keys never authenticate the probe routes, and a workstation key never
  authenticates any server route.
- Disabled workstations are removed from authentication (`403`) and accept no reports. Deleting a
  workstation deletes its history and invalidates its key.
- `POST /api/workstation-probe/revoke` invalidates **only the presented credential**: the workstation,
  its reports, its installation binding and its ID survive, so a later re-login rotates a new key for
  the same workstation. Revocation and deletion also expire every pending authorization code for that
  installation in the same D1 transaction, so a code issued before logout cannot silently re-key the
  machine; a fresh authorize afterwards works normally. The CLI logs out by revoking first and keeps
  its stored credential if the server cannot confirm.
- Per-key limits use a D1 window counter: reports 2/minute, targets 6/minute, enrollment 5 per ten
  minutes per installation (authorize is limited per principal).

## Probe

`GET /api/workstation-probe/targets` returns
`{ data: [{ server_id, name, address, family }], interval_seconds: 600, ping_count: 3 }`. Targets are
computed on every request from the owner's current authority (`connect.servers(owner, manager)`) and
only include active servers with a **globally routable unicast** address. `isPublicIp` validates the
whole literal with the shared IPv6 parser before any range decision. IPv6 must be global unicast
(`2000::/3`) minus the IANA special-purpose blocks inside it: `2001::/23` (Teredo, benchmark
`2001:2::/48`, ORCHID/ORCHIDv2, AMPR and peers), `2001:db8::/32`, `3fff::/20` documentation and
`2002::/16` 6to4; translation forms (6to4, Teredo, NAT64) are excluded entirely, so an embedded
private IPv4 can never surface. IPv4 rejects private, loopback, link-local, CGNAT, multicast,
reserved, IETF-assignment, benchmark and documentation ranges. A literal such as
`2001:4860:4860::8888]/foo` is invalid, not public. The list is capped at 100. A key can never widen its own target set, and target addresses are
never client supplied.

Fixtures use real public literals such as `8.8.8.8` and `2001:4860:4860::8888`; no test performs a
network call. Documentation ranges (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`,
`2001:db8::/32`) are deliberately non-public, and a target-list test proves bad literals are dropped
while good neighbours survive.

`POST /api/workstation-probe/reports` reads at most 64 KiB within five seconds using the shared body
reader, then validates the payload strictly (unknown keys rejected, no coercion) and verifies that
every connectivity entry matches a **currently** authorized server and its current address/family.
Reports are validated against `WorkstationReportInput`:

| Field                | Type                                                              | Rules                                                          |
| -------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| `report_id`          | UUID                                                              | RFC 4122 canonical, version 1–8, variant 8/9/a/b               |
| `started_at`         | epoch seconds                                                     | integer; run length ≤ 120 s                                    |
| `finished_at`        | epoch seconds                                                     | integer, not before `started_at`, within 300 s of receipt      |
| `sample_window_ms`   | integer                                                           | 1–120000                                                       |
| `cli_version`        | string                                                            | 1–32 characters                                                |
| `hostname`           | string                                                            | 1–253 characters, not blank                                    |
| `os`                 | string                                                            | 1–128 characters                                               |
| `arch`               | string                                                            | 1–32 characters                                                |
| `uptime_seconds`     | integer                                                           | 0–3155760000                                                   |
| `cpu`                | object                                                            | `model` 1–128, `count` 1–1024, `usage_pct` 0–100 or `null`     |
| `mem`                | object                                                            | `total_bytes` ≥ 1, `available_bytes` 0…total, `used_pct` 0–100 |
| `disk`               | array ≤ 64                                                        | `mount` 1–512, bytes 0…total, `used_pct` 0–100                 |
| `network.interfaces` | array ≤ 32                                                        | `name` 1–64, `addresses` ≤ 16, literal matching `family`       |
| `connectivity`       | array ≤ 100                                                       | unique `server_id`; different servers may share an address     |
| `connectivity[]`     | `{ server_id, address, family, sent, received, rtts_ms, status }` | one entry per target                                           |
| `collection_errors`  | array ≤ 32                                                        | each 1–512 characters                                          |
| `targets_error`      | string or `null`                                                  | 1–512 characters when target discovery failed                  |

Byte values are integers within `1`–`1125899906842624` (1 PiB) when they are capacities, and
percentages are finite numbers. `sent` is always `3`. `rtts_ms` is a three element tuple of
milliseconds or `null`; a genuine `0` is valid (coarse platform clocks), only an unavailable probe is
`null`. `received` must equal the number of non-null entries.

| `status`      | Required outcome                                   |
| ------------- | -------------------------------------------------- |
| `reachable`   | `received = 3`, three RTT values                   |
| `partial`     | `received = 1` or `2`, matching RTT values         |
| `timeout`     | `received = 0`, all `null`                         |
| `unreachable` | `received = 0`, all `null`                         |
| `error`       | local failure; `received` still matches the RTTs   |
| `unsupported` | collector cannot probe; `received = 0`, all `null` |

Report IDs are scoped to their workstation: the primary key is `(workstation_id, report_id)`, so two
workstations may reuse the same report UUID and neither can overwrite the other. Within a workstation,
handling is idempotent by `report_id`: the same ID with the same normalized content returns the
original success result (`duplicate: true`, original `received_at`); the same ID with different content
returns `409`. The report row, connectivity rows and the workstation `last_seen_at`/`public_ip` update
are one D1 batch. Latest snapshot, `last_seen_at` and `public_ip` move only for a genuinely newer
sample (greatest `finished_at`, then receipt time, then report id): a duplicate or a late, older
sample is stored in history but never becomes latest, never refreshes liveness and never changes the
recorded public address. `last_seen_at` is the newest sample's `finished_at`. `public_ip` is the
platform-observed client address (`CF-Connecting-IP`) and only in production; development and E2E
store `null` instead of trusting a header. Every workstation observation response, including errors
and the exchange response, carries `Cache-Control: no-store`.

## Records, status and history

Reads return `WorkstationRecord`:

| Field           | Type                                                         |
| --------------- | ------------------------------------------------------------ |
| `id`            | workstation UUID assigned by the server                      |
| `owner`         | Access principal that enrolled it                            |
| `name`          | display name from the consent page                           |
| `created_at`    | epoch seconds                                                |
| `last_seen_at`  | epoch seconds or `null`                                      |
| `public_ip`     | last platform-observed public address or `null`              |
| `disabled`      | boolean; disabled workstations cannot report                 |
| `latest_report` | `WorkstationReportRecord` or `null` (report + `received_at`) |

Status is derived with `computeWorkstationStatus`, never stored: `disabled`, `recent`, or `stale`
when `last_seen_at` is `null` or older than 1800 seconds. Clock skew into the future stays `recent`.
Staleness is informational and never creates a critical alert.

History reads are bounded: `from`/`to` are Unix seconds with a maximum 30 day window (default: last
24 hours), `limit` is 1–100 (default 100), `offset` is a non-negative integer.

- `GET /api/workstations/{id}/metrics` returns `{ data: WorkstationMetricPoint[], page: { limit, offset, next_offset } }`
  ordered oldest first. `next_offset` is non-null only when the page was full.
- `GET /api/workstations/{id}/connectivity` returns `{ targets: WorkstationConnectivityHistory[], limit }`
  with the newest `limit` samples per target, each carrying `received`, `rtt_avg_ms`, `rtt_min_ms`,
  `rtt_max_ms` and `status`; unavailable RTT summaries stay `null`.

Retention uses the shared settings value: the existing aggregation cron
(`runScheduledMaintenance`) purges reports, connectivity rows, expired codes and stale rate windows
with `retention_days`, exactly like metrics and events.

## Access, Connect and surfaces

- Enrollment is human-only (`email:` principal). Browser reads use the normal Access session.
  `DELETE` additionally requires the same-origin confirmation and either ownership or a configured
  global manager (`CONNECT_MANAGERS`).
- Connect grants are explicit and read-only. A Connect key carries `workstationIds` beside
  `serverIds`; a workstation-only key is `{ serverIds: [], workstationIds: [id] }`. Existing keys stay
  server-only until an Access manager edits them, and each `batc_` key's effective workstation set is
  its configured IDs intersected with active workstations owned by its issuer or covered by
  `CONNECT_MANAGERS`, recomputed on every request. The junction is
  `connect_token_workstations(token_id, workstation_id)` with cascading deletes and no
  workstation-specific grant table.
- Connect reads only: `GET /api/v1/workstations`, `/workstations/{id}`, `/workstations/{id}/metrics`
  and `/workstations/{id}/connectivity`. No Connect path enrolls, revokes, disables or submits a
  report, even with write scope (`501`). Per-server observations are filtered twice: the workstation
  grant authorizes the snapshot, and the key's current `serverIds` authorize each connectivity entry
  and history target. Collection errors and `targets_error` are opaque CLI text, so Connect never
  returns them: a workstation-only key sees capacity with empty connectivity and no foreign ID,
  address or count in the entire response, including lists, joins, paging and cursors. Revoking a
  server grant or deleting/disabling a workstation takes effect on the next request; nothing is
  cached.
- Managing an existing key covers disabled workstations, so a mixed key stays visible and revocable
  after one of its targets is disabled; a global manager never loses that ability. New grants still
  require an active workstation within the issuer's authority, and retaining a disabled grant is
  allowed only for IDs already configured on the key.
- The deployment-wide monitoring lane (`BAT_READ_KEY`, `/api/monitoring/workstations…`) can read
  workstation snapshots and history for external monitors. `BAT_WRITE_KEY`, asset-scoped CLI tokens
  and Access sessions without a key cannot use that lane, and Connect keys cannot use it either.
- CLI: package `@nocoo/bat` with bin `bat` replaces the private `@bat/cli` / `bat-cli` name. Workstation
  commands live under `bat workstation` with an isolated config and credential store, a stable random
  installation UUID, and the same loopback `/callback` contract.
- UI: `/workstation-login` under Access handles the incoming PKCE query, posts to
  `/api/workstation-auth/authorize` with the consent fields and redirects to the returned
  `redirect_url`. Workstation selection in the Connect token manager is a later UI phase; the
  management DTO already exposes `workstationIds`. The UI must render `null`, `partial`, `timeout` and
  `unsupported` honestly instead of a `0` percentage or `0 ms`. UI and CLI work is a separate phase;
  this document fixes their contract.

## Detail page

`/workstations/{id}` puts the machine first and the links under it:

- **Header card.** Name with the derived status, one system line, the history
  window and the delete action, then a five-cell grid: the copyable public
  address, CPU, memory, reachable targets and P95 round-trip time, each with its
  window trend. A refused clipboard write says so instead of claiming success.
- **Left column.** `Load` overlays CPU and memory on the percentage axis with
  uptime in days on a second axis; `Reachability` draws one line per target and
  puts the focused target's packet loss on a second 0-100 % axis; `Targets`
  lists last, P50, P95, loss and a per-target trend, each row linking to the
  server host detail.
- **Right rail.** Machine inventory from the latest report, utilisation rings,
  the newest-result donut and the interface list. Nothing is fabricated when the
  report is missing: the rings and readings show a dash.
- **Topology.** A hub-and-spoke graph of this workstation and every authorized
  server, built on React Flow (`@xyflow/react`). Colour identifies the target,
  the badge carries the ICMP result, answering links carry a travelling pulse,
  and `prefers-reduced-motion` stops it. Selecting a node mirrors the chart
  legend's focus. The table above stays the exact, accessible record; the graph
  is an overview, not a second source.

Charts are composed with Recharts plus the shared Basalt chart config so the
second axes, tooltips and legend typography stay consistent with the rest of the
dashboard.

## Verification

- Unit: `packages/worker/src/**/workstation*.test.ts` (pure helpers, D1 adapter over the mock,
  route/middleware behaviour) and `packages/shared/src/__tests__/workstations.test.ts`.
- L2: `packages/worker/test/e2e/workstations.test.ts` enrolls with a local Access fixture key, exchanges
  a PKCE code, probes, uploads an idempotent report, reads history and revokes over real local HTTP
  with native persistence. `packages/worker/test/e2e/connect-workstations.test.ts` covers ws-only,
  mixed, empty and write keys, denial, filtered connectivity and immediate revocation, plus the
  monitoring lane. Run with `bun turbo test:e2e --filter=@bat/worker` after `bun run build`;
  never against the daily gateway.
