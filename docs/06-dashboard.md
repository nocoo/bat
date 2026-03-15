# 06 — Dashboard

> Next.js 16 dashboard for monitoring visualization. Google OAuth login, server-side proxy to Worker, host overview, charts, alerts page.
> Bootstrapped from `../surety` template. Deployed on Railway (Bun standalone Docker).
>
> Related documents:
> - [02-architecture.md](./02-architecture.md) — System overview, auth model, proxy pattern, deployment
> - [03-data-structures.md](./03-data-structures.md) — Payload types, alert definitions, health response
> - [05-worker.md](./05-worker.md) — Worker read routes that Dashboard proxies to

---

## Bootstrap from `../surety`

### Direct copy (change nav items / branding only)

- `src/auth.ts` — Google OAuth + email allowlist (**strip TOTP references**: remove `isTotpEnabled()` / `consumeNonce()` callbacks; Surety's TOTP depends on `@/lib/totp` which requires a DB-backed `TotpStore` + `TOTP_MASTER_KEY` / `TOTP_HMAC_SECRET` env vars — not worth porting for a single-user monitoring dashboard)
- `src/proxy.ts` + `src/lib/proxy-logic.ts` — auth guard (remove TOTP redirect logic, keep session check only)
- `src/components/layout/*` — AppShell, Sidebar
- `src/components/ui/*` — all shadcn/ui components
- `src/app/globals.css` — Basalt design tokens
- `src/app/login/page.tsx` — login page
- `Dockerfile` — Bun standalone 3-stage build

### Remove from Surety

- `db/` (Drizzle/SQLite) — bat uses D1 via Worker, not local SQLite
- `repositories/` — no local database layer
- `lib/totp/` — TOTP 2FA module (requires DB-backed TotpStore)
- Insurance-specific pages (`policies/`, `claims/`, etc.)
- `services/backy.ts` — Surety-specific backup service

---

## Proxy Architecture

Dashboard does NOT expose Worker URLs or API Keys to the browser. Instead, Dashboard API Routes act as a server-side proxy:

```
Browser ──cookie──→ Dashboard /api/hosts ──API Key──→ Worker /api/hosts ──→ D1
                    (session check)         (server-side, no CORS)
```

See [02-architecture.md § Dashboard proxy pattern](./02-architecture.md) for full rationale.

### Proxy routes

| Dashboard route | Proxies to Worker | Method |
|-----------------|-------------------|--------|
| `/api/hosts` | `GET /api/hosts` | GET |
| `/api/hosts/[id]/metrics` | `GET /api/hosts/:id/metrics` | GET |
| `/api/alerts` | `GET /api/alerts` | GET |

Each proxy route:

1. Checks the user's NextAuth session (Google OAuth cookie, same domain)
2. If unauthenticated → return `401`
3. Forward request to `BAT_API_URL` + path with `Authorization: Bearer <BAT_READ_KEY>`
4. Return Worker response to browser (pass through status code + JSON body)

**Note**: Dashboard does NOT proxy write routes (`/api/ingest`, `/api/identity`). Those are only accessible to Probe with `BAT_WRITE_KEY`.

**Note**: Dashboard does NOT proxy `/api/health`. The health endpoint is public on the Worker and consumed directly by Uptime Kuma.

---

## Pages

| Route | Description |
|-------|-------------|
| `/` | Redirect to `/hosts` |
| `/login` | Google OAuth login (from Surety) |
| `/hosts` | Overview grid: per-host cards with status badge, CPU%, MEM%, uptime |
| `/hosts/[id]` | Detail: time-series charts (CPU, Memory, Network), disk bars, system info, active alerts |
| `/alerts` | All active alerts across hosts |

### `/hosts` — Host Overview

Grid of `HostCard` components. Each card shows:
- Hostname + status badge (healthy / warning / critical / offline)
- CPU usage % (current)
- Memory usage % (current)
- Uptime
- Last seen timestamp

Data source: `GET /api/hosts` (Dashboard proxy) → `HostOverviewItem[]` via SWR hook with 30s refresh. DTO defined in [03-data-structures.md § GET /api/hosts](./03-data-structures.md).

### `/hosts/[id]` — Host Detail

Full detail view with:
- System info panel (OS, kernel, arch, CPU model, boot time)
- Time-series charts (CPU, Memory, Network) with time range picker
- Disk usage horizontal bars (per-mount)
- Active alerts for this host

Time range picker options:
- **Raw data ranges**: 1h, 6h, 24h → queries `GET /api/hosts/:id/metrics?from=&to=`
- **Hourly data ranges**: 7d, 30d, 90d → same endpoint, Worker auto-selects hourly resolution

Data source: `GET /api/hosts/[id]/metrics` → `MetricsQueryResponse` via SWR hook. DTO defined in [03-data-structures.md § GET /api/hosts/:id/metrics](./03-data-structures.md).

### `/alerts` — Alerts Overview

Table of all active alerts across all hosts:
- Host (link to detail page)
- Rule ID + human-readable message
- Severity badge (warning / critical)
- Triggered at timestamp
- Current value

Data source: `GET /api/alerts` (Dashboard proxy) → `AlertItem[]` via SWR hook with 30s refresh. DTO defined in [03-data-structures.md § GET /api/alerts](./03-data-structures.md).

---

## Data Fetching

### API client (`lib/api.ts`)

Fetch wrapper that calls Dashboard's own `/api/*` proxy routes (NOT Worker directly):

```typescript
export async function fetchAPI<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

### SWR hooks (`lib/hooks/`)

| Hook | Endpoint | Response type | Refresh |
|------|----------|---------------|---------|
| `useHosts()` | `/api/hosts` | `HostOverviewItem[]` | 30s |
| `useHostMetrics(id, from, to)` | `/api/hosts/[id]/metrics?from=&to=` | `MetricsQueryResponse` | 30s |
| `useAlerts()` | `/api/alerts` | `AlertItem[]` | 30s |

---

## Charts (Recharts, Basalt palette)

All charts use Recharts with the Basalt 24-color chart palette. Widget patterns from Basalt's `NetworkOpsDashboardPage`.

| Chart | Type | Data |
|-------|------|------|
| CPU | Line chart | usage%, iowait%, steal% (3 lines) |
| Memory | Area chart | used% with threshold line at 85% |
| Network | Dual-axis line chart | rx bytes/sec, tx bytes/sec |
| Disk | Horizontal bar chart | per-mount used% |
| Load average | Sparklines | load1, load5, load15 (in host card) |

### Data transformation

Charts receive raw API data and need ViewModel transformation:

- **CPU chart**: Extract `cpu_usage_pct`, `cpu_iowait`, `cpu_steal` from metrics array, map to `{ ts, usage, iowait, steal }[]`
- **Memory chart**: Extract `mem_used_pct`, map to `{ ts, used_pct }[]`, add threshold constant line
- **Network chart**: Parse `net_json`, aggregate across interfaces or show per-interface, map to `{ ts, rx_rate, tx_rate }[]`
- **Disk bars**: Parse `disk_json` from latest sample, map to `{ mount, used_pct, total_bytes, avail_bytes }[]`

These transformations are pure functions in `lib/transforms.ts`, unit-testable without rendering.

---

## Components

| Component | File | Description |
|-----------|------|-------------|
| `HostCard` | `components/host-card.tsx` | Card with status badge, key metrics, click → detail |
| `StatusBadge` | `components/status-badge.tsx` | Colored badge: healthy (green), warning (yellow), critical (red), offline (gray) |
| `AlertTable` | `components/alert-table.tsx` | Table of active alerts with severity, host link, timestamp |
| CPU/Memory/Network/Disk charts | `components/charts/*` | Recharts wrappers with Basalt palette |
| AppShell, Sidebar | `components/layout/*` | From Surety template, nav items updated |

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `BAT_API_URL` | Worker URL (e.g. `https://bat-worker.xxx.workers.dev`) |
| `BAT_READ_KEY` | Read-only API Key for Worker |
| `AUTH_SECRET` | NextAuth secret |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `ALLOWED_EMAILS` | Comma-separated email allowlist |
| `USE_SECURE_COOKIES` | `true` for production |
| `E2E_SKIP_AUTH` | `1` to bypass auth in E2E tests |

---

## Testing Strategy (this module)

### L1 — Unit Tests (`bun test`)

| Test file | What |
|-----------|------|
| `lib/transforms.test.ts` | CPU/Memory/Network/Disk data transformation. Edge cases: empty arrays, missing fields, single data point |
| `lib/proxy-logic.test.ts` | Route decision table: authenticated → forward, unauthenticated → 401, path mapping correct |
| `components/host-card.test.tsx` | Render with mock data: healthy/warning/critical/offline states |
| `components/status-badge.test.tsx` | Correct color/text for each severity level |
| `components/alert-table.test.tsx` | Render alert rows, host links, severity badges |

**Coverage target**: ≥ 90% on `lib/transforms.ts`, `lib/proxy-logic.ts`, and ViewModel functions. Component tests focus on correctness of rendered output, not visual pixel-matching.

### L2 — Lint

- Biome strict mode, zero errors + zero warnings
- Typecheck: `tsc --noEmit`

### L3 — Proxy Route Integration Tests (`bun test`)

Dashboard proxy routes are thin but contain real logic (session check, header injection, status passthrough, error mapping). These route handlers are tested as integration tests against a mock Worker backend:

| Test | Route | Validates |
|------|-------|-----------|
| Authenticated request | `GET /api/hosts` | Session valid → forwards to Worker with `BAT_READ_KEY`, returns Worker response |
| Unauthenticated request | `GET /api/hosts` | No session → 401, Worker never called |
| Worker error passthrough | `GET /api/hosts` | Worker returns 500 → Dashboard returns 500 to browser |
| Query param forwarding | `GET /api/hosts/[id]/metrics?from=&to=` | Params forwarded to Worker correctly |
| All proxy routes covered | `GET /api/hosts`, `/api/hosts/[id]/metrics`, `/api/alerts` | Each route tested |

**Note**: These are route-level integration tests (session mock + HTTP mock), not full E2E against a live Worker. Worker API correctness is covered by [05-worker.md § L3](./05-worker.md).

### L4 — BDD E2E (Playwright)

Core flows:

| Flow | Steps |
|------|-------|
| Login | Navigate → Google OAuth → redirect to `/hosts` |
| Overview | See all hosts → status badges correct → click host |
| Host detail | Charts render → time range picker works → system info visible |
| Alerts | Navigate to `/alerts` → active alerts shown → link to host detail |

**Server convention**: BDD E2E dev server on port 28787.
**Auth bypass**: `E2E_SKIP_AUTH=1` environment variable (same pattern as Surety).

---

## Atomic Commits (this module)

| # | Commit | Files | Verify |
|---|--------|-------|--------|
| 4.1 | `feat: add api proxy routes to worker` | `app/api/hosts/route.ts`, `app/api/alerts/route.ts`, etc. | L1 UT: proxy logic. L3: route integration tests (session mock, header forwarding, error passthrough) |
| 4.2 | `feat: add api client and swr hooks` | `lib/api.ts`, `lib/hooks/*` | UT: fetch wrapper, mock responses |
| 4.3 | `feat: add host card and status badge components` | `components/host-card.tsx`, `status-badge.tsx` | UT: render with mock data |
| 4.4 | `feat: add hosts overview page` | `app/hosts/page.tsx` | Dev server: grid renders |
| 4.5 | `feat: add chart components` | `components/charts/*` | UT: data transformation |
| 4.6 | `feat: add host detail page with charts` | `app/hosts/[id]/page.tsx` | Dev server: charts render |
| 4.7 | `feat: add alerts page` | `app/alerts/page.tsx`, `components/alert-table.tsx` | Dev server: alerts render |
| 4.8 | `feat: configure sidebar navigation` | `components/layout/sidebar.tsx` | Nav items correct |
| 4.9 | `test: add bdd e2e tests for core flows` | `e2e/**` | Playwright: login → overview → detail → alerts |
