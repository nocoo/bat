# 13 — Host Events

## Overview

Host Events provides a webhook-based channel for servers to report event logs (deployments, backups, cron jobs, etc.) to the monitoring system. Events are stored in D1 and displayed on the Dashboard.

## Data Model

### webhook_configs

Per-host webhook configuration with auto-generated tokens and rate limiting.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| host_id | TEXT UNIQUE | FK → hosts.host_id |
| token | TEXT UNIQUE | 32-char hex, system-generated |
| rate_limit | INTEGER | Max events per minute (default 10) |
| is_active | INTEGER | 0/1 toggle |
| window_start | INTEGER | Current rate-limit window (epoch) |
| window_count | INTEGER | Events in current window |
| created_at | INTEGER | Unix seconds |
| updated_at | INTEGER | Unix seconds |

### events

Event log entries submitted via webhook.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| host_id | TEXT | FK → hosts.host_id |
| webhook_config_id | INTEGER | FK → webhook_configs.id |
| title | TEXT | 1-200 chars |
| body | TEXT | JSON object, ≤16KB |
| tags | TEXT | JSON array, ≤10 items, each ≤50 chars |
| source_ip | TEXT | CF-Connecting-IP |
| created_at | INTEGER | Unix seconds |

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/events | Webhook token + IP | Ingest event |
| GET | /api/events | BAT_READ_KEY | List events |
| GET | /api/webhooks | BAT_READ_KEY | List webhook configs |
| POST | /api/webhooks | BAT_WRITE_KEY | Create webhook config |
| DELETE | /api/webhooks/:id | BAT_WRITE_KEY | Delete webhook config |
| POST | /api/webhooks/:id/regenerate | BAT_WRITE_KEY | Regenerate token |

### POST /api/events validation

1. Bearer token → lookup active webhook_config
2. CF-Connecting-IP (Cloudflare-injected, non-spoofable) must equal host's public_ip; missing header → 400, null public_ip → 403, mismatch → 403
3. Rate limit check (sliding minute window in D1)
4. Payload validation: title, body (JSON object), tags (optional)
5. Insert → 204

### Rate limiting

D1-based sliding minute window using atomic `UPDATE ... RETURNING`. The `window_start` and `window_count` fields on `webhook_configs` track the current window state. Default limit: 10 events/minute per host.

## Dashboard UI

### Events page (`/events`)

- Sidebar: Monitoring group, between Alerts and Tags
- Table: Time | Host | Title | Tags | expandable Body (JSON prettified)
- SWR 30s auto-refresh

### Webhook Settings page (`/settings/webhooks`)

- Sidebar: Settings group
- Host selector to create new webhook
- List: Hostname | Token (masked) | Rate limit | Status | Actions
- Actions: Regenerate token, Delete, Copy curl example

## Data retention

Events are purged after 30 days by the scheduled worker (same cron as metrics purge).

## Migration

`0013_host_events.sql` — creates `webhook_configs` and `events` tables with indexes.
