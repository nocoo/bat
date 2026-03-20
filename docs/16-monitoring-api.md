# 16 — Monitoring API (Uptime Kuma Integration)

> Related: [05-worker](./05-worker.md), [01-metrics-catalogue](./01-metrics-catalogue.md), [03-data-structures](./03-data-structures.md), [11-host-tags](./11-host-tags.md)

## Overview

Expose a new set of Worker APIs under `/api/monitoring/*` that let external monitoring systems (specifically Uptime Kuma) query onboarded hosts, their health tiers, active alerts, and group-level summaries. The goal is to close the loop: bat monitors *internal* host health, Uptime Kuma monitors *external* reachability — this API bridges both worlds.

## Motivation

Today bat and Uptime Kuma operate independently:

- **Bat** knows which hosts are onboarded, what alerts are firing, and host health tiers — but this data only surfaces in the Dashboard.
- **Uptime Kuma** knows external reachability (ping, HTTP keyword, SSL certs) — but has no awareness of bat's internal health signals.

A monitoring API enables:

1. **Uptime Kuma keyword monitors** that check bat host health → a single monitor covers 28 internal alert rules instead of duplicating checks.
2. **Group-level endpoints** that Uptime Kuma can monitor as aggregate health (e.g. "all VPS hosts healthy").
3. **Automatic monitor management** — the `uptime-kuma` skill can read this API to discover new hosts and create/update monitors programmatically.

## Design Principles

1. **Read-only** — no mutations via these endpoints; state lives in D1 alert_states.
2. **Auth via `BAT_READ_KEY`** — same as existing Dashboard→Worker read routes.
3. **Keyword-friendly** — responses include deterministic keyword strings (`"tier":"healthy"`) that Uptime Kuma keyword monitors can match against.
4. **No caching** — responses carry `Cache-Control: private, no-store` to prevent shared caches from leaking authenticated host/alert data. Data staleness is bounded by the 30s probe ingest interval regardless.

---

## API Endpoints

### `GET /api/monitoring/hosts`

List all onboarded hosts with their current health tier and alert summary.

**Response:**

```jsonc
{
  "status": "ok",
  "host_count": 6,
  "by_tier": {
    "healthy": 4,
    "warning": 1,
    "critical": 0,
    "offline": 1
  },
  "hosts": [
    {
      "host_id": "abc123",
      "hostname": "us.nocoo.cloud",
      "tier": "healthy",       // healthy | warning | critical | offline
      "last_seen": 1711036800,
      "alert_count": 0,
      "alerts": []
    },
    {
      "host_id": "def456",
      "hostname": "jp.nocoo.cloud",
      "tier": "warning",
      "last_seen": 1711036790,
      "alert_count": 1,
      "alerts": [
        {
          "rule_id": "iowait_high",
          "severity": "warning",
          "value": 22.5,
          "message": "I/O wait 22.5% > 20% for 5m",
          "triggered_at": 1711036500
        }
      ]
    }
  ]
}
```

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `tier` | string | (all) | Filter: `healthy`, `warning`, `critical`, `offline` |
| `tag` | string | (all) | Filter by tag name (multiple allowed, AND logic) |

**Uptime Kuma usage:** this endpoint is for **discovery and fleet overview** — the sync script reads it to enumerate hosts and create per-host monitors. It is **not** suitable as a keyword monitor target (matching `"tier":"healthy"` against a list would false-positive on any single healthy host). For per-host monitoring use `/api/monitoring/hosts/:id`. For fleet-level liveness use the existing `GET /api/live` (public, no auth) or `GET /api/fleet/status` (auth, returns `"status":"healthy"/"degraded"/"critical"`).

---

### `GET /api/monitoring/hosts/:id`

Single host health detail — designed as a dedicated Uptime Kuma keyword endpoint.

**Response:**

```jsonc
{
  "status": "ok",
  "host_id": "abc123",
  "hostname": "us.nocoo.cloud",
  "tier": "healthy",
  "last_seen": 1711036800,
  "uptime_seconds": 864000,
  "alert_count": 0,
  "alerts": [],
  "tags": ["vps", "us-east"]
}
```

**`:id` resolution:** accepts both raw `host_id` and 8-char `hid` hash (consistent with existing `/api/hosts/:id`).

**Uptime Kuma usage:** keyword monitor on `"tier":"healthy"` — any degradation (warning/critical/offline) triggers DOWN.

---

### `GET /api/monitoring/groups`

Aggregate health by tag group — maps naturally to Uptime Kuma monitor groups.

Hosts with **no tags** are collected into a synthetic `"(untagged)"` group so they are never silently excluded from the aggregation view.

**Response:**

```jsonc
{
  "status": "ok",
  "groups": [
    {
      "tag": "vps",
      "host_count": 6,
      "tier": "warning",       // worst tier among group members
      "by_tier": {
        "healthy": 4,
        "warning": 1,
        "critical": 0,
        "offline": 1
      },
      "alert_count": 2,
      "hosts": ["us.nocoo.cloud", "jp.nocoo.cloud", "..."]
    },
    {
      "tag": "(untagged)",
      "host_count": 1,
      "tier": "healthy",
      "by_tier": { "healthy": 1, "warning": 0, "critical": 0, "offline": 0 },
      "alert_count": 0,
      "hosts": ["new-host.example.com"]
    }
  ]
}
```

**Group tier derivation:** worst-of among members (offline > critical > warning > healthy), using `deriveHostStatus` with port_allowlist (see Tiered Health Model below).

**Uptime Kuma usage:** this endpoint is for **discovery and sync** — the sync script reads it to enumerate groups and create corresponding Uptime Kuma group-type monitors. It is **not** suitable as a keyword monitor target (same list-matching false-positive problem as `/api/monitoring/hosts`). Group health is derived from the per-host monitors beneath each Uptime Kuma group — if any child monitor goes DOWN, the group reflects it automatically via Uptime Kuma's built-in group status aggregation.

---

### `GET /api/monitoring/alerts`

Active alerts enriched for monitoring consumption — flatter structure than `/api/alerts`.

**Response:**

```jsonc
{
  "status": "ok",
  "alert_count": 3,
  "by_severity": {
    "critical": 1,
    "warning": 2,
    "info": 0
  },
  "alerts": [
    {
      "host_id": "abc123",
      "hostname": "us.nocoo.cloud",
      "rule_id": "mem_high",
      "severity": "critical",
      "value": 92.3,
      "message": "Memory 92.3% with swap 65%",
      "triggered_at": 1711036500,
      "duration_seconds": 300,
      "tags": ["vps", "us-east"]
    }
  ]
}
```

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `severity` | string | (all) | Filter: `critical`, `warning`, `info` |
| `tag` | string | (all) | Filter by host tag |

**Uptime Kuma usage:** keyword monitor on `"alert_count":0` — any active alert triggers DOWN.

---

## Tiered Health Model

**Must call `deriveHostStatus()` from `services/status.ts`** — not re-implement. This function encapsulates the full derivation logic including the `port_allowlist` suppression rule:

| Tier | Condition | Uptime Kuma Keyword |
|------|-----------|---------------------|
| `healthy` | No alerts, last_seen < 120s | `"tier":"healthy"` |
| `warning` | Any warning-severity alert (excluding port_allowlist-suppressed `public_port`) | `"tier":"warning"` |
| `critical` | Any critical-severity alert | `"tier":"critical"` |
| `offline` | last_seen > 120s | `"tier":"offline"` |

The monitoring endpoints must query `port_allowlist` and pass `allowedPorts` to `deriveHostStatus`, exactly as `fleet-status.ts` and `hosts.ts` already do. This ensures Dashboard and Uptime Kuma always agree on a host's tier.

---

## Architecture Decision: Worker Reads Tags (Read-Only)

[11-host-tags](./11-host-tags.md) established that tags are "user-initiated state" with CRUD owned by the Dashboard via D1 REST API. That boundary remains intact — **the Worker never writes tags**.

However, this design introduces **Worker read access to `tags` and `host_tags`** for the `/api/monitoring/groups` and tag-enriched endpoints. This is a new cross-boundary read:

- **Justification**: the monitoring API runs on the Worker (Cloudflare Workers) where D1 is a native binding — no REST roundtrip needed. Duplicating this in the Dashboard would require the Dashboard to proxy Uptime Kuma requests, adding unnecessary latency and complexity.
- **Scope**: read-only SELECT on `tags` and `host_tags`. No INSERT/UPDATE/DELETE.
- **11-host-tags.md update**: ✅ Done — amended to "Worker has read-only access to tags for monitoring aggregation; never writes them."

---

## Integration with Uptime Kuma Skill

The `uptime-kuma` skill (`.agents/skills/uptime-kuma/`) can automate monitor lifecycle:

### Auto-onboarding flow

1. Query `GET /api/monitoring/hosts` to discover all bat hosts.
2. Query `GET /api/monitoring/groups` to discover tag-based groups.
3. Via Socket.IO, create/update Uptime Kuma monitors:
   - **Per-group monitor**: Uptime Kuma `group` type, one per bat tag.
   - **Per-host monitor**: keyword type, URL = `/api/monitoring/hosts/:hid`, keyword = `"tier":"healthy"`.
     - **Multi-tag hosts**: Uptime Kuma monitors have exactly one `parent`. Pick the **first tag alphabetically** as the parent group. The monitor's `name` or `description` can list all tags for visibility, but the parent is singular and deterministic.
     - **Untagged hosts**: parent = the `(untagged)` Uptime Kuma group.
   - **Fleet-wide alert monitor**: keyword type, URL = `/api/monitoring/alerts`, keyword = `"alert_count":0`.
4. Remove monitors for retired hosts (`is_active = 0`).

### Suggested Uptime Kuma structure

```
bat (group)
├── Fleet Alerts (keyword → /api/monitoring/alerts)
├── VPS (group)
│   ├── us.nocoo.cloud  (keyword → /api/monitoring/hosts/:hid)
│   ├── jp.nocoo.cloud  (keyword → /api/monitoring/hosts/:hid)
│   └── ...
├── Railway (group)
│   └── ...
└── Cloudflare Worker (group)
    └── bat-ingest (keyword → /api/live)
```

---

## Implementation Plan

### Phase 1: Core endpoints (Worker)

1. Add route file `packages/worker/src/routes/monitoring.ts`.
2. **Query strategy** — follow the existing pattern in `fleet-status.ts` and `hosts.ts`: **separate queries, assemble in code**. No multi-table JOINs that risk cartesian blowup.
   - Query 1: `SELECT host_id, hostname, last_seen FROM hosts WHERE is_active = 1`
   - Query 2: `SELECT host_id, severity, rule_id, message, value, triggered_at FROM alert_states WHERE host_id IN (?...)`
   - Query 3: `SELECT host_id, port FROM port_allowlist WHERE host_id IN (?...)`
   - Query 4 (tag endpoints only): `SELECT ht.host_id, t.name FROM host_tags ht JOIN tags t ON ht.tag_id = t.id WHERE ht.host_id IN (?...)`
   - Query 5 (single-host `/hosts/:id` only): `SELECT uptime_seconds FROM metrics_raw WHERE host_id = ? ORDER BY ts DESC LIMIT 1`
   - Computed fields:
     - `duration_seconds` in `/alerts`: `Math.floor(Date.now() / 1000) - triggered_at`
     - `uptime_seconds` in `/hosts/:id`: from latest metrics_raw row (same pattern as `host-detail.ts`)
     - `alert_count` / `by_tier` / `by_severity`: aggregated in code from the query results
   - Assemble: build per-host Maps, call `deriveHostStatus()` per host, aggregate by tag for groups.
3. `GET /api/monitoring/hosts` — host list with tier + alerts.
4. `GET /api/monitoring/hosts/:id` — single host with tags.
5. `GET /api/monitoring/alerts` — alert_states enriched with hostname and tags.
6. `GET /api/monitoring/groups` — group by tag, derive worst-tier per group. Untagged hosts → `"(untagged)"` group.
7. Auth: `BAT_READ_KEY` (reuse existing `apiKeyAuth` middleware).
8. Response headers: `Cache-Control: private, no-store`.
9. Register routes in `index.ts` under the existing read routes block.

### Phase 2: ~~Update 11-host-tags.md~~ ✅

Already applied — see [11-host-tags.md § Architecture](./11-host-tags.md#architecture).

### Phase 3: Tests

1. Unit tests for group aggregation and `(untagged)` fallback logic.
2. E2E tests: seed D1 with hosts + alerts + tags + port_allowlist → assert response shapes, keyword presence, and tier correctness (especially port_allowlist suppression).
3. Add migration entries to E2E `wrangler.test.ts` migration list if new migrations are needed (see retrospective).

### Phase 4: Uptime Kuma sync script

1. Create a one-shot bun script (extend `socketio-client.mjs` pattern) that:
   - Fetches `/api/monitoring/hosts` and `/api/monitoring/groups`.
   - Diffs against current Uptime Kuma `monitorList`.
   - Creates missing monitors, removes stale ones.
2. Document the sync workflow in CLAUDE.md.

### No new migrations needed

All required data already exists: `hosts`, `alert_states`, `host_tags`, `tags`, `port_allowlist`. The new endpoints are pure read queries — no schema changes.

---

## Open Questions

1. **Auth for Uptime Kuma requests** — `BAT_READ_KEY` in Uptime Kuma's HTTP header config supports custom headers. Verify Uptime Kuma keyword monitor supports `Authorization: Bearer <key>` or a custom `X-API-Key` header.
2. **Rate limiting** — should `/api/monitoring/*` have stricter rate limits given it's polled every 60s per monitor? Current Worker has no rate limiting on read routes.
3. **Notification bridging** — should bat alerts trigger Uptime Kuma notifications (via status change), or keep notification channels separate? Initial answer: separate — bat has its own future notification system planned.
