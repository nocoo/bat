---
name: uptime-kuma
description: "Manage Uptime Kuma monitors — check service status, SSL cert expiry, response times, uptime metrics, and create/edit/delete monitors. Use this skill whenever the user asks about service health, uptime, whether something is down, SSL certificates, monitoring coverage, or wants to add/remove/pause monitors. Also use when comparing deployed services against monitored endpoints, or when the user mentions 'Uptime Kuma' directly. Triggers on: 'is X down', 'status check', 'SSL expiry', 'certificate expiring', 'add monitor', 'which services are monitored', 'response time slow', 'uptime report'."
---

# Uptime Kuma

Manage an Uptime Kuma instance — read service health, SSL certs, response times via Prometheus metrics, and create/edit/delete monitors via Socket.IO.

## Quick Reference: Choosing the Right Approach

| Task | Method | Auth |
|------|--------|------|
| Check status / SSL / response times | `curl` Prometheus `/metrics` | API key |
| Find DOWN monitors | `curl` + `grep` | API key |
| List all monitors with full config | Socket.IO `monitorList` event | username/password |
| Add / edit / delete / pause monitors | Socket.IO events | username/password |
| Send heartbeat (push monitors) | `curl` push endpoint | none |

**Read-only tasks** → use bash `curl` commands (fast, no dependencies).
**Write tasks** → copy `scripts/socketio-client.mjs` to `/tmp/`, add operations, run with `bun`.

## Configuration

Read connection details from `config.json` in the skill directory (gitignored — never commit):

```bash
CONFIG="$(cat skills/uptime-kuma/config.json)"
BASE_URL=$(echo "$CONFIG" | jq -r '.base_url')
API_KEY=$(echo "$CONFIG" | jq -r '.api_key')
```

Fields: `base_url`, `api_key` (read-only metrics), `username` + `password` (full CRUD via Socket.IO).

## Read Operations (curl + API Key)

API keys authenticate via HTTP Basic Auth with empty username:

```bash
# All metrics at once
curl -sf -u ":$API_KEY" "$BASE_URL/metrics"

# Monitor status (1=Up, 0=Down)
curl -sf -u ":$API_KEY" "$BASE_URL/metrics" | grep "^monitor_status{"

# DOWN monitors only
curl -sf -u ":$API_KEY" "$BASE_URL/metrics" | grep "^monitor_status{" | grep "} 0$"

# SSL certs expiring within 30 days
curl -sf -u ":$API_KEY" "$BASE_URL/metrics" \
  | grep "^monitor_cert_days_remaining{" \
  | awk -F'} ' '{if ($2 < 30) print $0}'

# Response times
curl -sf -u ":$API_KEY" "$BASE_URL/metrics" | grep "^monitor_response_time{"

# Filter by monitor name
curl -sf -u ":$API_KEY" "$BASE_URL/metrics" | grep 'monitor_name="my-service"'
```

**Metric labels** on every line: `monitor_id`, `monitor_name`, `monitor_type`, `monitor_url`, `monitor_hostname`, `monitor_port`.

| Metric | Meaning | Values |
|--------|---------|--------|
| `monitor_status` | Current state | `1` Up, `0` Down |
| `monitor_response_time` | Last ping (ms) | numeric |
| `monitor_cert_days_remaining` | SSL days left | numeric |
| `monitor_cert_is_valid` | Cert valid? | `1` yes, `0` no |

## Write Operations (Socket.IO via Bun)

Write operations use Socket.IO with username/password auth. A reusable client template lives at `scripts/socketio-client.mjs` — copy it to `/tmp/`, add your operations, and run with `bun`.

### How Socket.IO works with Uptime Kuma

1. Connect via WebSocket, emit `login` with username/password
2. After login, Uptime Kuma **pushes** the full monitor list via a `monitorList` event (not a callback) — wait ~2s for it to arrive
3. Emit events for CRUD; each returns `{ ok: true/false, msg, monitorID? }`
4. Always disconnect when done

### Add Monitor

```javascript
const res = await emit("add", {
  type: "keyword",              // http, keyword, ping, group, port, dns, push
  name: "my-service",
  url: "https://example.com/api/live",
  keyword: "\"status\":\"ok\"", // for keyword type
  method: "GET",
  interval: 60,                 // seconds
  retryInterval: 60,
  maxretries: 3,
  parent: null,                 // group ID, or null for top-level
  notificationIDList: { "1": true },
  accepted_statuscodes: ["200-299"],
  conditions: [],               // required in v2.x, can be empty
});
// → { ok: true, msg: "successAdded", monitorID: 42 }
```

**Type-specific required fields:**

| Type | Required | Notes |
|------|----------|-------|
| `keyword` | `url`, `keyword`, `method` | Checks URL response contains keyword |
| `http` | `url`, `method` | Checks HTTP status code |
| `ping` | `hostname` | ICMP ping |
| `group` | `name` | Container for child monitors, set `parent` on children |
| `port` | `hostname`, `port` | TCP port check |
| `dns` | `hostname`, `dns_resolve_type` | DNS resolution |

### Edit Monitor

Construct the payload with explicit fields — do not spread the `monitorList` object directly, because runtime fields like `path`, `pathName`, `childrenIDs` cause SQL binding errors.

```javascript
const res = await emit("editMonitor", {
  id: 42,
  type: "keyword",
  name: "my-service-v2",
  url: "https://example.com/api/live",
  keyword: "\"status\":\"ok\"",
  method: "GET",
  interval: 60,
  retryInterval: 60,
  maxretries: 3,
  parent: null,
  notificationIDList: { "1": true },
  accepted_statuscodes: ["200-299"],
  conditions: [],
});
// → { ok: true, msg: "Saved.", monitorID: 42 }
```

### Delete, Pause, Resume

```javascript
await emit("deleteMonitor", 42);    // → { ok: true, msg: "successDeleted" }
await emit("pauseMonitor", 42);     // → { ok: true, msg: "successPaused" }
await emit("resumeMonitor", 42);    // → { ok: true, msg: "successResumed" }
```

### Create a Group

Groups are monitors with `type: "group"`. Child monitors reference the group via `parent`:

```javascript
const group = await emit("add", { type: "group", name: "My Group", conditions: [] });
// Then add children with: parent: group.monitorID
```

### Get Heartbeat History

```javascript
const beats = await emit("getMonitorBeats", monitorId, hours);
// → { data: [{ id, monitor_id, status, msg, time, ping, duration, ... }] }
```

## Push Monitors (no auth)

For push-type monitors, send heartbeats directly:

```bash
curl -sf "$BASE_URL/api/push/<push_token>?status=up&msg=OK&ping=123"
curl -sf "$BASE_URL/api/push/<push_token>?status=down&msg=Service+unavailable"
```

## Public Endpoints (no auth)

```bash
# Status badges (only for monitors on public status pages)
curl -sf "$BASE_URL/api/badge/<monitor_id>/status"
curl -sf "$BASE_URL/api/badge/<monitor_id>/uptime/720"  # 30-day uptime
curl -sf "$BASE_URL/api/badge/<monitor_id>/ping/24"     # 24h avg ping

# Status page data
curl -sf "$BASE_URL/api/status-page/<slug>"
curl -sf "$BASE_URL/api/status-page/heartbeat/<slug>"
```

## Presenting Results

When showing monitor data, make it scannable:

1. **DOWN monitors first** — always surface problems at the top
2. **SSL expiring < 30 days** — highlight as warnings
3. **Response time > 2000ms** — flag as slow
4. **Group by parent** — organize under their Uptime Kuma group labels
5. **Use markdown tables** — columns: Name, Status, Response Time, SSL Days, URL

## Pitfalls

- **`conditions: []` is required** for `add` and `editMonitor` in Uptime Kuma v2.x — omitting it causes a NOT NULL constraint error
- **Do not spread monitorList objects** into `editMonitor` — runtime fields cause binding errors; always build the payload explicitly
- **monitorList arrives via event, not callback** — after login, listen for the `monitorList` event and wait ~2s before accessing it
- **API key is read-only** — it only works for `/metrics` and push endpoints; any mutation requires Socket.IO with username/password
