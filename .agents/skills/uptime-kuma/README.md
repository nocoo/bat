# uptime-kuma-skill

An AI agent skill for managing [Uptime Kuma](https://github.com/louislam/uptime-kuma) monitors. Gives AI coding agents (Claude Code, Cursor, Windsurf, etc.) the ability to check service health, SSL certificates, response times, and create/edit/delete monitors — all through natural language.

## What It Does

This skill teaches your AI agent how to interact with an Uptime Kuma instance via two interfaces:

| Capability | Method | Auth Required |
|-----------|--------|---------------|
| Check monitor status (up/down) | Prometheus `/metrics` API | API key |
| View SSL certificate expiry | Prometheus `/metrics` API | API key |
| Check response times | Prometheus `/metrics` API | API key |
| Find DOWN monitors | Prometheus `/metrics` API | API key |
| List all monitors with full config | Socket.IO | Username/password |
| Add new monitors | Socket.IO | Username/password |
| Edit existing monitors | Socket.IO | Username/password |
| Delete monitors | Socket.IO | Username/password |
| Pause / resume monitors | Socket.IO | Username/password |
| Send push heartbeats | Push endpoint | None |

### Example Prompts

Once installed, you can ask your AI agent things like:

- *"Are any of my services down?"*
- *"Which SSL certificates are expiring soon?"*
- *"Add a keyword monitor for https://api.example.com/health"*
- *"Show me all monitors with response time over 1 second"*
- *"Pause the staging-api monitor"*
- *"Compare my deployed services against what's monitored"*

## Installation

### Via `npx skills` (Recommended)

```bash
npx skills add nocoo/uptime-kuma-skill
```

This works with any compatible agent: Claude Code, Cursor, Windsurf, GitHub Copilot, and [40+ others](https://skills.sh/).

### Manual Installation

Copy the `SKILL.md` and `scripts/` directory into your agent's skill directory:

```bash
# Claude Code
cp -r uptime-kuma-skill/ .claude/skills/uptime-kuma/

# Cursor
cp -r uptime-kuma-skill/ .cursor/skills/uptime-kuma/
```

## Configuration

Create a `config.json` file in the skill directory:

```json
{
  "base_url": "https://your-uptime-kuma.example.com",
  "api_key": "uk1_your_api_key_here",
  "username": "your_username",
  "password": "your_password"
}
```

| Field | Required | Purpose |
|-------|----------|---------|
| `base_url` | Yes | Your Uptime Kuma instance URL |
| `api_key` | For read ops | API key for Prometheus metrics (create in Settings > API Keys) |
| `username` | For write ops | Login username for Socket.IO CRUD operations |
| `password` | For write ops | Login password for Socket.IO CRUD operations |

> **Security**: Add `config.json` to your `.gitignore` — it contains credentials and should never be committed.

## How It Works

### Read Operations (Prometheus Metrics)

For status checks, the skill uses Uptime Kuma's Prometheus `/metrics` endpoint with API key authentication (HTTP Basic Auth, empty username):

```bash
# Quick status check
curl -sf -u ":$API_KEY" "$BASE_URL/metrics" | grep "^monitor_status{"

# Find DOWN monitors
curl -sf -u ":$API_KEY" "$BASE_URL/metrics" | grep "^monitor_status{" | grep "} 0$"

# SSL certs expiring within 30 days
curl -sf -u ":$API_KEY" "$BASE_URL/metrics" \
  | grep "^monitor_cert_days_remaining{" \
  | awk -F'} ' '{if ($2 < 30) print $0}'
```

Available metrics:

| Metric | Description | Values |
|--------|-------------|--------|
| `monitor_status` | Current state | `1` = Up, `0` = Down |
| `monitor_response_time` | Last response time (ms) | numeric |
| `monitor_cert_days_remaining` | Days until SSL cert expiry | numeric |
| `monitor_cert_is_valid` | SSL cert validity | `1` = Valid, `0` = Invalid |

### Write Operations (Socket.IO)

For creating, editing, and deleting monitors, the skill uses Uptime Kuma's Socket.IO interface. A reusable Bun script template is included at `scripts/socketio-client.mjs`.

The agent copies this template to `/tmp/`, adds the required operations, and runs it:

```javascript
// Add a keyword monitor
const res = await emit("add", {
  type: "keyword",
  name: "my-api",
  url: "https://api.example.com/health",
  keyword: "\"status\":\"ok\"",
  method: "GET",
  interval: 60,
  retryInterval: 60,
  maxretries: 3,
  parent: null,
  notificationIDList: { "1": true },
  accepted_statuscodes: ["200-299"],
  conditions: [],  // required in v2.x
});
```

Supported operations: `add`, `editMonitor`, `deleteMonitor`, `pauseMonitor`, `resumeMonitor`, `getMonitorBeats`.

## Supported Monitor Types

| Type | What It Checks |
|------|---------------|
| `http` | HTTP status code |
| `keyword` | HTTP response contains a keyword |
| `ping` | ICMP ping |
| `port` | TCP port reachability |
| `dns` | DNS resolution |
| `push` | Passive heartbeat (service pushes to Uptime Kuma) |
| `group` | Logical container for organizing monitors |
| `docker` | Docker container status |
| `mqtt` | MQTT broker connectivity |
| `postgres` / `mysql` / `mongodb` / `redis` | Database connectivity |

## Known Pitfalls

These are hard-won lessons from testing against Uptime Kuma v2.x:

- **`conditions: []` is required** — The `add` and `editMonitor` events require a `conditions` field (can be an empty array). Omitting it causes a `NOT NULL constraint` error.
- **Don't spread monitorList objects into editMonitor** — The monitor list contains runtime-only fields (`path`, `pathName`, `childrenIDs`) that cause SQL binding errors. Always construct edit payloads with explicit fields.
- **monitorList arrives via event, not callback** — After login, the full monitor list is pushed as a `monitorList` event. You need to set up a listener before login and wait ~2 seconds for it to arrive.
- **API key is read-only** — It only grants access to the Prometheus `/metrics` endpoint and push endpoints. All mutations require Socket.IO with username/password.

## Requirements

- An [Uptime Kuma](https://github.com/louislam/uptime-kuma) instance (v2.x recommended)
- For read operations: an API key (create in Uptime Kuma UI → Settings → API Keys)
- For write operations: username and password, plus [Bun](https://bun.sh/) runtime and `socket.io-client` package
- A compatible AI coding agent ([full list](https://skills.sh/))

## Compatibility

Tested with Uptime Kuma **2.2.1**. Should work with any 2.x version. The Prometheus metrics endpoint is also available in 1.x, but Socket.IO event schemas may differ.

## License

[MIT](LICENSE)
