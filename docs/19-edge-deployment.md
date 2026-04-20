# 19 — Edge Deployment Design

> Detailed design of Bat's Cloudflare edge deployment: authentication flows, Worker routing, static asset serving, and dual-endpoint architecture.
>
> Related documents:
> - [02-architecture.md](./02-architecture.md) — System overview, monorepo structure
> - [05-worker.md](./05-worker.md) — Worker routes and business logic
> - [06-ui.md](./06-ui.md) — SPA build and UI architecture

---

## Deployment Topology

A single Cloudflare Worker instance serves both the API and the SPA static assets. Two custom domains route to the same Worker, distinguished by hostname at the edge:

```
                    ┌──────────────────────────────────┐
                    │        Cloudflare Edge            │
                    │                                    │
  Browser ─────────►  bat.hexly.ai (Access-protected)  │
                    │         │                          │
                    │         ▼                          │
                    │  ┌─────────────────────────┐      │
                    │  │    Worker (Hono)         │      │
                    │  │                          │      │
  Probe ──────────►  │  bat-ingest.worker.       │      │
  Uptime Kuma ────►  │  hexly.ai (no Access)     │      │
                    │  └───────────┬─────────────┘      │
                    │              │                      │
                    │              ▼                      │
                    │          ┌──────┐                   │
                    │          │  D1  │                   │
                    │          └──────┘                   │
                    └──────────────────────────────────┘
```

### Two endpoints, one Worker

| Endpoint | Domain | Cloudflare Access | Purpose |
|----------|--------|-------------------|---------|
| Browser | `bat.hexly.ai` | Yes (email allowlist) | Dashboard UI + browser API |
| Machine | `bat-ingest.worker.hexly.ai` | No | Probe writes, monitoring reads, public health |

Both domains are configured as custom domains in `wrangler.toml` and resolve to the same Worker deployment.

---

## Authentication Architecture

### Three auth scopes

| Scope | Mechanism | Who uses it | Routes |
|-------|-----------|-------------|--------|
| **Write** | `BAT_WRITE_KEY` (Bearer) | Probe | `POST /api/ingest`, `/api/identity`, `/api/tier2` |
| **Machine read** | `BAT_READ_KEY` (Bearer) | Uptime Kuma | `GET /api/monitoring/*` |
| **Browser** | Cloudflare Access JWT | Dashboard users | `GET /api/hosts`, `/api/alerts`, `/api/tags`, etc. |
| **Public** | None | Anyone | `GET /api/live`, `GET /api/me` |

### Middleware chain

Every request passes through three middleware layers in order:

```
Request → entryControl → accessAuth → apiKeyAuth → Route handler
```

#### 1. Entry Control (`middleware/entry-control.ts`)

First gate. Routes requests based on hostname:

| Hostname pattern | Behavior |
|-----------------|----------|
| `localhost` / `127.0.0.1` / `*.dev.hexly.ai` | **Bypass** — local dev / E2E testing, no auth |
| `bat-ingest.*` | **Whitelist mode** — only pre-approved method+path pairs pass; everything else → 403 |
| Everything else (`bat.*`) | **Pass through** — browser endpoint, handled by accessAuth |

Machine endpoint whitelist:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/ingest` | Probe metrics |
| POST | `/api/identity` | Probe host identity |
| POST | `/api/tier2` | Probe tier-2 checks |
| POST | `/api/events` | Webhook event ingestion |
| GET | `/api/monitoring/*` | Uptime Kuma reads (prefix match) |
| GET | `/api/live` | Public health check |
| GET | `/api/me` | Public user info |

Any request to `bat-ingest.*` not matching this whitelist returns 403 immediately. This prevents the machine endpoint from being used to access browser-only routes.

#### 2. Access Auth (`middleware/access-auth.ts`)

Cloudflare Access JWT verification for the browser endpoint. Only runs on `/api/*` routes.

**Skip conditions** (calls `next()` immediately):
- Localhost (local dev)
- Machine endpoint (`bat-ingest.*`)
- Public route (`/api/live`)

**Fail-closed design**: If `CF_ACCESS_TEAM_DOMAIN` or `CF_ACCESS_AUD` environment variables are missing on the browser endpoint, returns **500** immediately. This prevents a fallback path that could bypass auth.

**Verification flow**:

```
1. Read JWT from Cf-Access-Jwt-Assertion header
   ├── Missing → 401 Unauthorized
   └── Present ↓

2. Fetch JWKS from https://{teamDomain}/cdn-cgi/access/certs
   (cached in module scope, keyed on teamDomain)

3. Verify JWT signature + claims
   ├── jose.jwtVerify(jwt, jwks, { issuer, audience })
   ├── Invalid → 403 Forbidden
   └── Valid ↓

4. Set context flag: accessAuthenticated = true
   (consumed by apiKeyAuth to skip API key check)
```

**JWKS caching**: The JWKS key set is cached at module scope (per Worker isolate lifetime). This avoids refetching Cloudflare's cert endpoint on every request while automatically refreshing when the isolate recycles.

#### 3. API Key Auth (`middleware/api-key.ts`)

Final auth layer. Enforces API key on machine routes, skips for browser users who already passed Access JWT.

**No-auth fast paths**:
- Public routes: `/api/live`, `/api/me`
- `POST /api/events` (webhook — uses its own per-host token validation)
- Localhost (development)

**Browser bypass**: If `accessAuthenticated === true` AND the host is the browser endpoint (not `bat-ingest`) AND the path is not a monitoring route, API key check is skipped entirely. Browser users authenticate via Cloudflare Access, not API keys.

**Key scope separation**:

| Key | Scope | Routes |
|-----|-------|--------|
| `BAT_WRITE_KEY` | Write operations | `POST /api/ingest`, `/api/identity`, `/api/tier2`, plus CRUD on webhooks, maintenance, tags, ports |
| `BAT_READ_KEY` | Read operations | All GET routes on machine endpoint |

Cross-key usage is rejected: using a read key on a write route (or vice versa) returns a specific error message. Token is extracted from `Authorization: Bearer <token>`.

---

## Static Asset Serving

### Wrangler Assets (v4)

The SPA is built by `packages/ui` (Vite) into `packages/worker/static/`. Wrangler's `[assets]` config serves these files:

```toml
[assets]
directory = "./static"
binding = "ASSETS"
run_worker_first = ["/api/*"]
not_found_handling = "single-page-application"
```

**How it works**:

1. **`run_worker_first = ["/api/*"]`** — Any request matching `/api/*` hits the Worker code first (route handlers). Everything else (JS, CSS, images, HTML) is served directly from the static asset bundle at the edge.

2. **`not_found_handling = "single-page-application"`** — When a static file is not found (e.g. `/hosts/abc123`), Wrangler returns `index.html` instead of 404. This enables client-side routing — React Router handles the path.

3. **No CDN cache concern** — Wrangler assets are content-addressed and served with immutable hashes. The `index.html` entry point is served with appropriate cache headers to pick up new deploys.

### Build pipeline

```
packages/ui/src/  ──(vite build)──►  packages/worker/static/
                                           │
                                     ┌─────┴──────┐
                                     │  wrangler   │
                                     │  deploy     │──►  Cloudflare Edge
                                     └────────────┘
```

`bun turbo build --filter=@bat/ui` builds the SPA. `npx wrangler deploy` uploads both Worker code and static assets together.

---

## Login Flow (Browser)

End-to-end flow when a user opens `bat.hexly.ai`:

```
1. Browser → bat.hexly.ai
   │
   ├── First visit (no Access cookie):
   │   │
   │   ▼
   │   Cloudflare Access login page
   │   ├── Email allowlist policy (configured in Zero Trust dashboard)
   │   ├── User authenticates (email code / Google OAuth)
   │   └── Access sets CF_Authorization cookie
   │
   ├── Subsequent visits (valid cookie):
   │   │
   │   ▼
   │   Access validates cookie at edge → injects Cf-Access-Jwt-Assertion header
   │
   ▼
2. Worker receives request
   │
   ├── Path: / (or any non-/api/* path)
   │   └── Wrangler assets serves index.html → SPA loads
   │
   ├── Path: /api/*
   │   ├── entryControl: bat.* → pass through
   │   ├── accessAuth: verify JWT → set accessAuthenticated=true
   │   ├── apiKeyAuth: accessAuthenticated=true → skip
   │   └── Route handler returns JSON
   │
   ▼
3. SPA renders, fetches /api/hosts, /api/alerts, etc.
   (All API calls include Cf-Access-Jwt-Assertion automatically —
    the cookie is same-origin, Access injects the header)
```

**Key insight**: The browser never sends API keys. Cloudflare Access handles authentication externally (at the edge), and the Worker only verifies the JWT signature. The SPA code has zero auth logic — it just calls `/api/*` and relies on the cookie-based Access session.

---

## Machine Endpoint Flow (Probe)

```
1. Probe → bat-ingest.worker.hexly.ai/api/ingest
   │       (POST, Authorization: Bearer BAT_WRITE_KEY)
   │
   ▼
2. Worker receives request
   ├── entryControl: bat-ingest.* → whitelist check → /api/ingest allowed
   ├── accessAuth: machine endpoint → skip
   ├── apiKeyAuth: extract Bearer token → match BAT_WRITE_KEY → pass
   └── Route handler: validate payload → store in D1 → evaluate alerts → 204
```

No Cloudflare Access involvement. The machine endpoint domain is not behind Access — probes connect directly with their API key.

---

## Monitoring Endpoint Flow (Uptime Kuma)

```
1. Uptime Kuma → bat-ingest.worker.hexly.ai/api/monitoring/health
   │             (GET, Authorization: Bearer BAT_READ_KEY)
   │
   ▼
2. Worker receives request
   ├── entryControl: bat-ingest.* → whitelist check → /api/monitoring/* allowed
   ├── accessAuth: machine endpoint → skip
   ├── apiKeyAuth: extract Bearer token → match BAT_READ_KEY → pass
   └── Route handler: query D1 → return health status + host details
```

Uptime Kuma also monitors `GET /api/live` (public, no auth) as a basic liveness check.

---

## Local Development

### Mode 1: HMR with production data (recommended)

```
bat.dev.hexly.ai (Caddy) → localhost:7025 (Vite dev)
                                │
                                └── /api/* proxy → bat-ingest.worker.hexly.ai (production Worker)
```

- Vite dev server on port 7025, proxies `/api/*` to the production machine endpoint
- Real production data, hot module replacement for UI changes
- User info shows "anonymous" (no Access JWT from localhost)

### Mode 2: Full local stack

```
localhost:7025 (Vite dev) → localhost:8787 (Wrangler dev)
```

- Both Vite and Wrangler run locally
- Local D1 database (empty or seeded)
- Auth completely bypassed (entryControl detects localhost)

### Mode 3: Production-like test

```
localhost:8787 (Wrangler dev, serving static from packages/worker/static/)
```

- Build UI first, then run Wrangler which serves the built assets
- Tests the exact same asset serving path as production

---

## Deployment Procedure

### Prerequisites

Worker secrets must be set (one-time):
```bash
npx wrangler secret put BAT_WRITE_KEY --env production
npx wrangler secret put BAT_READ_KEY --env production
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN --env production
npx wrangler secret put CF_ACCESS_AUD --env production
```

### Deploy sequence

**Order matters**: D1 migrations before Worker deploy. Deploying Worker code that references new columns without applying the migration causes 500 on all affected routes.

```bash
# 1. Build UI into Worker static assets
bun turbo build --filter=@bat/ui

# 2. Apply D1 migrations (if any new ones)
cd packages/worker
npx wrangler d1 migrations apply bat-db --remote --env production

# 3. Deploy Worker (code + static assets)
npx wrangler deploy --env production
```

### Verify

```bash
# Health check
curl -s https://bat-ingest.worker.hexly.ai/api/live | jq .version

# Browser access
open https://bat.hexly.ai
```

---

## Wrangler Configuration

### Production (`wrangler.toml`)

```toml
name = "bat"
main = "src/index.ts"
compatibility_date = "2025-04-01"

# Dual custom domains
routes = [
  { pattern = "bat.hexly.ai", custom_domain = true },
  { pattern = "bat-ingest.worker.hexly.ai", custom_domain = true }
]

# Static SPA assets
[assets]
directory = "./static"
binding = "ASSETS"
run_worker_first = ["/api/*"]
not_found_handling = "single-page-application"

# D1 database
[[d1_databases]]
binding = "DB"
database_name = "bat-db"

# Hourly aggregation cron
[triggers]
crons = ["0 * * * *"]
```

### Test environment (`[env.test]`)

Isolated D1 database (`bat-db-test`) and separate domain (`bat-ingest-test.worker.hexly.ai`). See [07-testing.md § D1 Isolation](./07-testing.md#d1--test-isolation).

---

## Security Boundaries

| Boundary | Enforcement | Fail mode |
|----------|-------------|-----------|
| Browser → API | Cloudflare Access JWT (edge) + Worker verification | 401/403 (fail-closed) |
| Probe → API | Bearer token (BAT_WRITE_KEY) | 401 (no token) / 403 (wrong key) |
| Monitoring → API | Bearer token (BAT_READ_KEY) | 401/403 |
| Machine → browser routes | Entry control whitelist | 403 (blocked at first middleware) |
| Cross-key usage | Scope separation in apiKeyAuth | Specific error message |
| Missing env vars | Fail-closed check in accessAuth | 500 (not silent pass-through) |
| SPA client-side routes | `not_found_handling = "single-page-application"` | Returns index.html (React Router handles) |
