# 16 — Monitoring API (Uptime Kuma Integration)

> Related: [05-worker](./05-worker.md), [01-metrics-catalogue](./01-metrics-catalogue.md), [03-data-structures](./03-data-structures.md)

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
4. **Cacheable** — responses can tolerate 30s staleness (aligned with probe ingest interval).

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

**Uptime Kuma usage:** keyword monitor on `"status":"ok"` — goes DOWN if the Worker itself is unhealthy.

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
    }
  ]
}
```

**Group tier derivation:** worst-of among members (offline > critical > warning > healthy), consistent with existing `deriveHostStatus` priority.

**Uptime Kuma usage:** one keyword monitor per group checking `"tier":"healthy"`. The `uptime-kuma` skill can auto-create a monitor group per tag.

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

Map existing `deriveHostStatus` logic to a clear keyword vocabulary:

| Tier | Condition | Uptime Kuma Keyword |
|------|-----------|---------------------|
| `healthy` | No alerts, last_seen < 120s | `"tier":"healthy"` |
| `warning` | Any warning-severity alert | `"tier":"warning"` |
| `critical` | Any critical-severity alert | `"tier":"critical"` |
| `offline` | last_seen > 120s | `"tier":"offline"` |

This is identical to the existing `deriveHostStatus` in `/api/hosts` — no new logic, just a stable keyword contract.

---

## Integration with Uptime Kuma Skill

The `uptime-kuma` skill (`.claude/skills/uptime-kuma/`) can automate monitor lifecycle:

### Auto-onboarding flow

1. Query `GET /api/monitoring/hosts` to discover all bat hosts.
2. Query `GET /api/monitoring/groups` to discover tag-based groups.
3. Via Socket.IO, create/update Uptime Kuma monitors:
   - **Per-host monitor**: keyword type, URL = `/api/monitoring/hosts/:hid`, keyword = `"tier":"healthy"`, parent = corresponding group.
   - **Per-group monitor**: Uptime Kuma group type, children = host monitors sharing that tag.
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

1. Add route group `/api/monitoring/*` in `packages/worker/src/routes/`.
2. Reuse existing query logic from `hosts.ts` and `alerts.ts` — extract shared helpers if needed.
3. `GET /api/monitoring/hosts` — query hosts + LEFT JOIN alert_states + LEFT JOIN host_tags.
4. `GET /api/monitoring/hosts/:id` — single host variant with tag enrichment.
5. `GET /api/monitoring/alerts` — query alert_states JOIN hosts JOIN host_tags, add `duration_seconds` (now - triggered_at).
6. `GET /api/monitoring/groups` — query host_tags → GROUP BY tag, derive worst-tier per group.
7. Auth: `BAT_READ_KEY` (reuse existing `apiKeyAuth` middleware).
8. Add `Cache-Control: public, max-age=30` — safe since data is 30s stale at worst.

### Phase 2: Tests

1. Unit tests for tier derivation and group aggregation logic.
2. E2E tests: seed D1 with hosts + alerts + tags → assert response shapes and keyword presence.
3. Add migration entries to E2E `wrangler.test.ts` migration list if new migrations are needed (see retrospective).

### Phase 3: Uptime Kuma sync script

1. Create a one-shot bun script (extend `socketio-client.mjs` pattern) that:
   - Fetches `/api/monitoring/hosts` and `/api/monitoring/groups`.
   - Diffs against current Uptime Kuma `monitorList`.
   - Creates missing monitors, removes stale ones.
2. Document the sync workflow in CLAUDE.md.

### No new migrations needed

All required data already exists: `hosts`, `alert_states`, `host_tags`, `tags`. The new endpoints are pure read queries — no schema changes.

---

## Open Questions

1. **Auth for Uptime Kuma requests** — `BAT_READ_KEY` in Uptime Kuma's HTTP header config supports custom headers. Verify Uptime Kuma keyword monitor supports `Authorization: Bearer <key>` or a custom `X-API-Key` header.
2. **Rate limiting** — should `/api/monitoring/*` have stricter rate limits given it's polled every 60s per monitor? Current Worker has no rate limiting on read routes.
3. **Notification bridging** — should bat alerts trigger Uptime Kuma notifications (via status change), or keep notification channels separate? Initial answer: separate — bat has its own future notification system planned.
