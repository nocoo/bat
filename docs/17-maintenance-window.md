# 17 — Maintenance Window: Per-Host Daily Silence Schedule

> Related: [05-worker](./05-worker.md), [03-data-structures](./03-data-structures.md), [06-dashboard](./06-dashboard.md), [16-monitoring-api](./16-monitoring-api.md)

## Overview

Per-host optional daily recurring maintenance window. During the window: new alert evaluation is skipped on ingest, existing alerts in `alert_states` are filtered out of all read responses (never physically deleted), `alert_pending` entries are purged to prevent stale duration accumulation, host status shows `"maintenance"`, and charts render a grey semi-transparent overlay. Metrics are still ingested — no data loss.

**MVP scope**: each host can have **at most one** daily repeating window defined as `HH:MM → HH:MM` (UTC). Supports cross-midnight ranges (e.g. `23:00 → 02:00`). DB storage and all comparison logic use UTC; Dashboard converts to/from browser local timezone for display and input.

**DST caveat (accepted)**: the window is stored as fixed UTC times. Users in DST-observing timezones will see the local display shift by ±1h on DST transitions. This is intentional — server-side operations (backups, cron) typically run on UTC, so a fixed UTC window matches the actual maintenance schedule. The Dashboard shows both local and UTC times to make this transparent.

## Motivation

VPS machines have predictable downtime — nightly backups, planned reboots, provider maintenance. Without a maintenance concept, these events trigger `host_offline`, memory/disk alerts, and Uptime Kuma DOWN notifications, creating noise that trains users to ignore real incidents.

---

## Data Model

### hosts table extension

```sql
ALTER TABLE hosts ADD COLUMN maintenance_start TEXT;  -- "HH:MM" UTC, nullable
ALTER TABLE hosts ADD COLUMN maintenance_end TEXT;    -- "HH:MM" UTC, nullable
ALTER TABLE hosts ADD COLUMN maintenance_reason TEXT; -- freeform, ≤200 chars, nullable
```

- Both `maintenance_start` and `maintenance_end` must be NULL (no window) or both non-NULL.
- Format: `"HH:MM"` — zero-padded 24-hour, e.g. `"03:00"`, `"23:30"`.
- Cross-midnight: `start > end` semantically means "from start today to end tomorrow" — e.g. `"23:00"` → `"02:00"` covers 23:00–00:00–02:00 UTC daily.
- Migration: `0017_maintenance_window.sql`

---

## Shared Library

### `packages/shared/src/maintenance.ts` (new)

```typescript
/** Validate "HH:MM" format (00:00–23:59). */
export function isValidTimeHHMM(time: string): boolean;

/**
 * Check if a UTC time falls within a daily maintenance window.
 * Handles cross-midnight windows (start > end).
 *
 * @param nowHHMM  Current UTC time as "HH:MM"
 * @param start    Window start "HH:MM" UTC
 * @param end      Window end "HH:MM" UTC
 */
export function isInMaintenanceWindow(
  nowHHMM: string,
  start: string,
  end: string,
): boolean;

/** Convert unix seconds to "HH:MM" UTC string. */
export function toUtcHHMM(unixSeconds: number): string;
```

**`isInMaintenanceWindow` logic**:

```
if start < end:
    return start <= now < end       // same-day window
else:
    return now >= start || now < end // cross-midnight window
```

### Type extensions — `packages/shared/src/api.ts`

```typescript
// HostStatus: add "maintenance"
export type HostStatus = "healthy" | "warning" | "critical" | "offline" | "maintenance";

// HostOverviewItem: add fields
maintenance_start: string | null;   // "HH:MM" UTC
maintenance_end: string | null;     // "HH:MM" UTC
maintenance_reason: string | null;

// New DTO
export interface MaintenanceWindow {
  start: string;    // "HH:MM" UTC
  end: string;      // "HH:MM" UTC
  reason: string;   // may be ""
}
```

---

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/hosts/:id/maintenance` | BAT_READ_KEY | Get maintenance window (or `null`) |
| PUT | `/api/hosts/:id/maintenance` | BAT_WRITE_KEY | Set/update maintenance window |
| DELETE | `/api/hosts/:id/maintenance` | BAT_WRITE_KEY | Remove maintenance window |

### PUT `/api/hosts/:id/maintenance`

**Request body:**

```json
{
  "start": "03:00",
  "end": "05:00",
  "reason": "Nightly backup"
}
```

**Validation:**
- `:id` must resolve to an existing, active host (`is_active = 1`). Return `404` if not found, `403` if retired.
- `start`, `end`: required, must match `/^\d{2}:\d{2}$/`, valid time (00:00–23:59)
- `start` ≠ `end` (zero-length window not allowed)
- `reason`: optional string, max 200 chars

**Response:** `204 No Content`

**Implementation:**
1. `SELECT host_id, is_active FROM hosts WHERE host_id = ?` — 404 if not found, 403 if `is_active = 0`
2. `UPDATE hosts SET maintenance_start = ?, maintenance_end = ?, maintenance_reason = ? WHERE host_id = ?`

### GET `/api/hosts/:id/maintenance`

**Response:**

```jsonc
// Window set:
{ "start": "03:00", "end": "05:00", "reason": "Nightly backup" }

// No window:
null
```

Returns `404` if host not found.

### DELETE `/api/hosts/:id/maintenance`

Sets all three columns to NULL. Returns `404` if host not found, `403` if retired. Response on success: `204 No Content`.

---

## Worker Behavior Changes

### Core principle: query-time filtering for alert_states, physical purge for alert_pending

Maintenance suppression uses a **two-table strategy** because `alert_states` and `alert_pending` have different semantics:

- **`alert_states`** (fired alerts) — **query-time filtering, no DELETE**. Every read path checks `isInMaintenanceWindow()` and excludes alerts for maintenance hosts. When maintenance ends, pre-existing alerts reappear naturally without re-evaluation.

- **`alert_pending`** (duration rule timers) — **physical DELETE on entering maintenance**. Duration rules accumulate time as `elapsed = now - first_seen`. If `alert_pending` rows survive maintenance, the first post-maintenance ingest computes elapsed inclusive of the entire maintenance period, causing false instant-promotion. Purging `alert_pending` forces duration rules to restart their timers from scratch after maintenance.

**Why not physical deletion for alert_states too?**

A cron-based `clearMaintenanceAlerts()` fails for windows shorter than the cron interval: a 03:10→03:40 window is missed entirely by cron runs at 03:00 and 04:00. Ingest-path deletion only works when the host is online. Query-time filtering has neither problem — it's evaluated at read time, works for any window duration and regardless of host state.

**Why physical deletion for alert_pending?**

`alert_pending` is never surfaced to any read path — it's internal bookkeeping for the `handleDurationRule` write path. Query-time filtering cannot help here because the stale `first_seen` is consumed by `evaluateAlerts`, not by a read route. The purge happens on the ingest path (first payload inside the window), which is exactly when it's needed — the next `evaluateAlerts` call after maintenance is the one that would mis-compute elapsed time. For offline hosts, there's no ingest and thus no `evaluateAlerts` call, so stale `alert_pending` rows are harmless until the host comes back online and ingests again — at which point the ingest path purges them before `evaluateAlerts` runs.

### Ingest — alert suppression (write path)

`packages/worker/src/routes/ingest.ts`:

```
1. insertMetricsRaw(...)          ← unchanged, data always stored
2. if (inserted):
     updateHostLastSeen(...)
     check maintenance_start/maintenance_end from hosts row
     if currently in maintenance window:
       purge alert_pending for this host  ← prevent stale duration accumulation
       skip evaluateAlerts()              ← no new alerts written
     else:
       evaluateAlerts(...)                ← normal path
```

The host's maintenance columns are already available from the `SELECT is_active` query at the top of ingest — extend it to `SELECT is_active, maintenance_start, maintenance_end`.

**Write-path effects:**
- `evaluateAlerts()` is skipped → no new `alert_states` or `alert_pending` entries
- `DELETE FROM alert_pending WHERE host_id = ?` → purges any duration timers that were accumulating before maintenance began, so they don't falsely promote on the first post-maintenance ingest
- `alert_states` are left untouched (hidden by query-time filtering on read paths)

### Alert read paths — query-time filtering

All routes that return alerts must JOIN `hosts` and exclude maintenance hosts in application code. The existing SQL already JOINs `hosts` for `is_active` and `hostname` — extend to also SELECT `maintenance_start, maintenance_end`, then filter in the application layer using `isInMaintenanceWindow()`.

**Why application-layer, not SQL WHERE?** Cross-midnight window logic (`start > end`) is non-trivial in SQLite. `isInMaintenanceWindow()` is a well-tested shared function — reuse it rather than reimplement in SQL.

**Affected routes:**

| Route | Current behavior | Change |
|-------|-----------------|--------|
| `GET /api/alerts` (`alertsListRoute`) | Returns all alerts for active hosts | Filter out alerts where host is currently in maintenance |
| `GET /api/monitoring/alerts` (`monitoringAlertsRoute`) | Same SQL, adds tags + severity filter | Same filtering, also exclude from `alert_count` and `by_severity` tallies |
| `GET /api/hosts` (`hostsListRoute`) | Counts alerts per host for `alert_count` | Set `alert_count: 0` for maintenance hosts |
| `GET /api/hosts/:id` (`hostDetailRoute`) | Returns single host with `alert_count` from raw `alerts.length` | Set `alert_count: 0` for maintenance hosts (status already derived via `deriveHostStatus`) |
| `GET /api/monitoring/hosts` (`monitoringHostsRoute`) | Lists hosts with tier + alerts | Tier = `"maintenance"`, empty alerts array |
| `GET /api/monitoring/hosts/:id` | Single host with alerts | Tier = `"maintenance"`, empty alerts array |

**Pattern** (applied to each route):

```typescript
// After fetching alerts and host rows:
const nowHHMM = toUtcHHMM(Math.floor(Date.now() / 1000));

// For alert list routes — filter out maintenance host alerts:
const visibleAlerts = alerts.filter(a => {
    const host = hostMap.get(a.host_id);
    if (host?.maintenance_start && host?.maintenance_end
        && isInMaintenanceWindow(nowHHMM, host.maintenance_start, host.maintenance_end)) {
        return false;
    }
    return true;
});

// For host list/detail routes — zero out alert_count for maintenance hosts:
const alertCount = isInMaintenance ? 0 : alertCountMap.get(host.host_id) ?? 0;

// For host detail route (single host, alerts already fetched):
// alert_count is derived from raw alerts.length — override to 0 during maintenance.
// deriveHostStatus() already returns "maintenance", so status is correct.
```

### Status derivation

`packages/worker/src/services/status.ts` — `deriveHostStatus()`:

New signature:

```typescript
export function deriveHostStatus(
  lastSeen: number,
  now: number,
  alerts: AlertRow[],
  allowedPorts?: Set<number>,
  maintenance?: { start: string; end: string } | null,
): HostStatus;
```

Priority change: **maintenance > offline > critical > warning > healthy**

If the host is currently in its maintenance window (determined by `isInMaintenanceWindow`), return `"maintenance"` immediately, regardless of alerts or last_seen.

### Hosts list & host detail routes

- `SELECT` adds `maintenance_start, maintenance_end, maintenance_reason`
- Pass `maintenance` to `deriveHostStatus()`
- Include fields in response DTO

### Monitoring API

`/api/monitoring/hosts/:id` will return `"tier": "maintenance"` when the host is in its window. Uptime Kuma keyword monitors matching `"tier":"healthy"` will go DOWN — this is intentional (operators know it's maintenance, they can configure Uptime Kuma's own maintenance schedule to suppress notifications if desired).

`/api/monitoring/alerts` filters out maintenance host alerts at query time, so `alert_count` accurately reflects only non-maintenance hosts. The fleet alerts Uptime Kuma monitor (`"alert_count":0` keyword) stays green when the only active alerts are on maintenance hosts.

### Fleet status route

`packages/worker/src/routes/fleet-status.ts` — the existing `switch` only handles `healthy | warning | critical | offline`. Add a `"maintenance"` case that counts into a new `maintenance` bucket (or excludes maintenance hosts from degraded/critical rollup, depending on desired fleet semantics).

Chosen behavior: maintenance hosts are **excluded from fleet health derivation** — they don't count toward healthy, warning, or critical. The fleet response gains a `maintenance` count field:

```typescript
case "maintenance":
    maintenance++;
    break;
```

Fleet `status` is derived from the remaining non-maintenance hosts only. A fleet where all hosts are in maintenance shows `status: "healthy"` with `maintenance: N`.

**Type update**: `HealthResponse` in `packages/shared/src/alerts.ts` (and its documentation in `docs/03-data-structures.md`) must add the `maintenance: number` field:

```typescript
interface HealthResponse {
  status: "healthy" | "degraded" | "critical" | "empty";
  total_hosts: number;
  healthy: number;
  warning: number;
  critical: number;
  maintenance: number;  // ← new
  checked_at: number;
}
```

### Auth middleware

`packages/worker/src/middleware/api-key.ts` — add maintenance PUT/DELETE as write routes:

```typescript
// In isWriteRequest():
if (path.match(/^\/api\/hosts\/[^/]+\/maintenance$/) && (method === "PUT" || method === "DELETE")) return true;
```

**Precedent**: this follows the same pattern as webhook CRUD — Dashboard already holds `BAT_WRITE_KEY` (in `process.env.BAT_WRITE_KEY`) and uses it via `proxyToWorkerWithBody(..., true)` for webhook POST/DELETE/regenerate routes. The maintenance routes use the identical auth chain: Browser → Dashboard (NextAuth session check) → `proxyToWorkerWithBody` with write key → Worker `isWriteRequest` check. No new key exposure — the Dashboard has had write key access since webhooks were added in v0.7.0.

---

## Dashboard Changes

### StatusBadge

`packages/dashboard/src/components/status-badge.tsx`:

```typescript
maintenance: { label: "Maintenance", variant: "purple" },
```

Purple badge, consistent with the maintenance concept being a deliberate, non-alarming state.

### Maintenance Panel

New component: `packages/dashboard/src/components/maintenance-panel.tsx`

Placed in host detail right column, below AllowedPortsPanel.

**States:**
1. **No window set**: "No maintenance window" text + "Set Schedule" button
2. **Window active**: start/end times (displayed in browser timezone) + reason + "Edit" / "Remove" buttons
3. **Edit mode**: two `<input type="time">` fields + reason text input + Save/Cancel

**Timezone handling:**
- Display: show local time prominently + "(HH:MM UTC)" secondary label
- Input: user enters local time → convert to UTC before PUT
- Both representations visible at all times, so DST shifts are transparent

**Data flow:**
- Read: `useSWR` → Dashboard proxy `GET /api/hosts/${hid}/maintenance` → Worker
- Write: `fetch` → Dashboard proxy `PUT /api/hosts/${hid}/maintenance` → Worker
- Delete: `fetch` → Dashboard proxy `DELETE /api/hosts/${hid}/maintenance` → Worker
- After mutation: `mutate()` local + `globalMutate("hosts")` to refresh status badges

### Dashboard Proxy Routes

New file: `packages/dashboard/src/app/api/hosts/[id]/maintenance/route.ts`

```typescript
export async function GET(req, { params }) {
    await auth();
    return proxyToWorker(`/api/hosts/${params.id}/maintenance`);
}

export async function PUT(req, { params }) {
    await auth();
    const body = await req.json();
    return proxyToWorkerWithBody(`/api/hosts/${params.id}/maintenance`, "PUT", body, true);
}

export async function DELETE(req, { params }) {
    await auth();
    return proxyToWorkerWithBody(`/api/hosts/${params.id}/maintenance`, "DELETE", undefined, true);
}
```

### SWR Hook

`packages/dashboard/src/lib/hooks.ts`:

```typescript
export function useHostMaintenance(hid: string | null) {
    return useSWR<MaintenanceWindow | null>(
        hid ? `maintenance-${hid}` : null,
        () => fetchAPI(`/api/hosts/${hid}/maintenance`),
    );
}
```

### Chart Overlay

New component: `packages/dashboard/src/components/charts/maintenance-overlay.tsx`

Uses recharts `<ReferenceArea>` to render grey semi-transparent bands on time-series charts.

```typescript
/**
 * Compute ReferenceArea elements for maintenance windows within a chart's time range.
 *
 * For a daily repeating window, this may produce multiple bands
 * (one per calendar day that intersects the chart range).
 */
export function maintenanceAreas(
  start: string,       // "HH:MM" UTC
  end: string,         // "HH:MM" UTC
  rangeFrom: number,   // unix seconds (chart X axis start)
  rangeTo: number,     // unix seconds (chart X axis end)
): { x1: number; x2: number }[];
```

Each area is rendered as:

```tsx
<ReferenceArea
  x1={area.x1} x2={area.x2}
  fill="currentColor"
  fillOpacity={0.06}
  stroke="none"
  ifOverflow="hidden"
/>
```

All 6 time-series chart components gain an optional prop:

```typescript
maintenanceWindow?: { start: string; end: string } | null;
```

Modified charts:
- `cpu-chart.tsx`
- `memory-chart.tsx`
- `network-chart.tsx`
- `psi-chart.tsx`
- `disk-io-chart.tsx`
- `tcp-chart.tsx`

### Host Detail Page

`packages/dashboard/src/app/hosts/[id]/page.tsx`:

- Import `MaintenancePanel`, `useHostMaintenance`
- Fetch maintenance data: either from `HostOverviewItem.maintenance_start/end` or separate hook
- Pass `maintenanceWindow` to each chart component
- Add `<MaintenancePanel>` to right column

### Hosts List Page

No changes needed — `HostOverviewItem` already includes `status`, which will be `"maintenance"` when applicable. `StatusBadge` handles rendering automatically.

---

## Files Changed

| File | Change |
|------|--------|
| `packages/shared/src/maintenance.ts` | **NEW** — time utilities |
| `packages/shared/src/api.ts` | HostStatus + HostOverviewItem + MaintenanceWindow |
| `packages/shared/src/index.ts` | export maintenance module |
| `packages/worker/migrations/0017_maintenance_window.sql` | **NEW** — ALTER TABLE hosts |
| `packages/worker/src/routes/maintenance.ts` | **NEW** — CRUD handlers |
| `packages/worker/src/routes/ingest.ts` | skip evaluateAlerts during maintenance |
| `packages/worker/src/routes/hosts.ts` | SELECT + derive maintenance status |
| `packages/worker/src/routes/host-detail.ts` | SELECT + derive maintenance status |
| `packages/worker/src/routes/monitoring.ts` | maintenance-aware tier + query-time alert filtering |
| `packages/worker/src/routes/alerts.ts` | query-time filter: exclude maintenance host alerts |
| `packages/worker/src/routes/fleet-status.ts` | maintenance count bucket + exclude from fleet health |
| `packages/worker/src/services/status.ts` | maintenance in deriveHostStatus |
| `packages/worker/src/index.ts` | register maintenance routes |
| `packages/worker/src/middleware/api-key.ts` | maintenance mutations as write routes |
| `packages/shared/src/alerts.ts` | HealthResponse + maintenance count field |
| `docs/03-data-structures.md` | HealthResponse type update |
| `docs/06-dashboard.md` | proxy table + BAT_WRITE_KEY description update |
| `packages/worker/test/e2e/wrangler.test.ts` | add 0017 to migration list |
| `packages/dashboard/src/app/api/hosts/[id]/maintenance/route.ts` | **NEW** — proxy |
| `packages/dashboard/src/components/maintenance-panel.tsx` | **NEW** — settings UI |
| `packages/dashboard/src/components/charts/maintenance-overlay.tsx` | **NEW** — ReferenceArea |
| `packages/dashboard/src/components/status-badge.tsx` | maintenance variant |
| `packages/dashboard/src/components/charts/cpu-chart.tsx` | maintenanceWindow prop |
| `packages/dashboard/src/components/charts/memory-chart.tsx` | maintenanceWindow prop |
| `packages/dashboard/src/components/charts/network-chart.tsx` | maintenanceWindow prop |
| `packages/dashboard/src/components/charts/psi-chart.tsx` | maintenanceWindow prop |
| `packages/dashboard/src/components/charts/disk-io-chart.tsx` | maintenanceWindow prop |
| `packages/dashboard/src/components/charts/tcp-chart.tsx` | maintenanceWindow prop |
| `packages/dashboard/src/lib/hooks.ts` | useHostMaintenance hook |
| `packages/dashboard/src/app/hosts/[id]/page.tsx` | panel + chart overlay integration |

---

## Testing

### Unit tests

- `isInMaintenanceWindow`: same-day window, cross-midnight window, boundary (exact start = in, exact end = out), `"00:00"` → `"00:00"` rejection
- `isValidTimeHHMM`: valid/invalid formats, edge values
- `toUtcHHMM`: various unix timestamps
- `maintenanceAreas`: 1h range inside window, 24h range spanning midnight, 7d range producing multiple bands

### E2E tests

- CRUD: PUT → GET → PUT (update) → GET → DELETE → GET (null)
- Ingest during maintenance: seed window → ingest → verify no new alert_states written
- Ingest outside maintenance: same host → ingest → verify alerts evaluated
- Status derivation: host in maintenance → hostsListRoute returns `"maintenance"` status
- Query-time alert filtering: seed alert_states for maintenance host → GET /api/alerts → verify those alerts are excluded from response
- Monitoring alerts filtering: same seed → GET /api/monitoring/alerts → verify alert_count excludes maintenance host

### Manual verification

1. Set maintenance window via Dashboard → status badge turns purple
2. During window: probe ingest continues, no new alerts, Uptime Kuma shows `"tier":"maintenance"`
3. Outside window: alerts fire normally, status reverts to derived tier
4. Charts show grey overlay bands at correct positions
5. Timezone conversion: set 3:00 AM local → verify stored as correct UTC

---

## Design Decisions (resolved from review)

1. **Alert suppression during maintenance**: ✅ Resolved — **two-table strategy**: query-time filtering for `alert_states`, physical purge for `alert_pending`.
   - **`alert_states` (fired alerts)**: never deleted. Read paths filter them out using `isInMaintenanceWindow()`. When maintenance ends, they reappear on the next read.
   - **`alert_pending` (duration timers)**: physically deleted on the ingest path (`DELETE FROM alert_pending WHERE host_id = ?`) to prevent stale `first_seen` values from causing false instant-promotion after maintenance. Duration rules restart their timers cleanly post-maintenance.
   - **Write path (ingest)**: `evaluateAlerts()` is skipped, purge `alert_pending`.
   - **Why not physical deletion for alert_states?** Cron fails for short windows; ingest-path fails for offline hosts. Query-time filtering works for any duration and any host state.
   - **Why physical deletion for alert_pending?** `alert_pending.first_seen` is consumed by the write path (`handleDurationRule`), not by read routes. Query-time filtering can't help. But the purge only needs to happen before the next `evaluateAlerts` call — which is on the ingest path, exactly where we do it. Offline hosts don't ingest, so stale rows are harmless until the host comes back.

2. **Uptime Kuma coordination**: Per-host keyword monitors will go DOWN (`"tier":"maintenance"` ≠ `"tier":"healthy"`). This is acceptable — operators can set Uptime Kuma's own maintenance schedule for the corresponding monitors. Automating this is out of scope for MVP.

3. **DST timezone drift**: Accepted behavior. The window is stored as fixed UTC times. Server-side operations (backups, cron) run on UTC, so a fixed UTC window matches the actual maintenance schedule. Dashboard displays both local and UTC time to make this transparent to the user.

4. **Dashboard WRITE_KEY usage**: Not a new security boundary change. Dashboard already holds `BAT_WRITE_KEY` and uses it for webhook CRUD (POST/DELETE/regenerate) since v0.7.0. Maintenance routes follow the identical auth chain. `docs/06-dashboard.md` has been updated:
   - ✅ Proxy table split into read (BAT_READ_KEY) and write (BAT_WRITE_KEY) sections
   - ✅ `BAT_WRITE_KEY` description updated to include webhook CRUD and maintenance CRUD
   - ✅ Proxy route description clarifies `proxyToWorkerWithBody(..., useWriteKey: true)` for write routes

5. **fleet-status.ts handling**: Maintenance hosts get their own count bucket and are excluded from fleet health derivation. The `HealthResponse` type in `packages/shared/src/alerts.ts` and its documentation in `docs/03-data-structures.md` must both gain the `maintenance: number` field.

6. **PUT/DELETE on missing/retired hosts**: Explicit error responses — 404 for missing host, 403 for retired. No silent 204 on nonexistent targets.
