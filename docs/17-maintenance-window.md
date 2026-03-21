# 17 — Maintenance Window: Per-Host Daily Silence Schedule

> Related: [05-worker](./05-worker.md), [03-data-structures](./03-data-structures.md), [06-dashboard](./06-dashboard.md), [16-monitoring-api](./16-monitoring-api.md)

## Overview

Per-host optional daily recurring maintenance window. During the window, alert evaluation is skipped, existing alerts are cleared, host status shows `"maintenance"`, and charts render a grey semi-transparent overlay. Metrics are still ingested — no data loss.

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

### Ingest — alert suppression + clearing

`packages/worker/src/routes/ingest.ts`:

```
1. insertMetricsRaw(...)          ← unchanged, data always stored
2. if (inserted):
     updateHostLastSeen(...)
     check maintenance_start/maintenance_end from hosts row
     if currently in maintenance window:
       clearHostAlerts(db, hostId)  ← DELETE from alert_states + alert_pending
       skip evaluateAlerts()
     else:
       evaluateAlerts(...)
```

The host's maintenance columns are already available from the `SELECT is_active` query at the top of ingest — extend it to `SELECT is_active, maintenance_start, maintenance_end`.

**Alert clearing rationale**: if we only skip `evaluateAlerts` without clearing existing alerts, the `/api/monitoring/alerts` endpoint still reports `alert_count > 0` and the fleet alerts Uptime Kuma monitor (`"alert_count":0` keyword) stays DOWN — directly contradicting the "reduce noise" goal. Clearing is safe because:
- After maintenance ends, the next ingest re-evaluates all rules from scratch
- Instant rules (duration=0) re-fire immediately if conditions persist
- Duration rules restart their pending timers, which is correct — the host just came back from maintenance

`clearHostAlerts` is a new helper in `packages/worker/src/services/alerts.ts`:
```typescript
export async function clearHostAlerts(db: D1Database, hostId: string): Promise<void> {
    await db.prepare("DELETE FROM alert_states WHERE host_id = ?").bind(hostId).run();
    await db.prepare("DELETE FROM alert_pending WHERE host_id = ?").bind(hostId).run();
}
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

`/api/monitoring/alerts` will return `alert_count: 0` for maintenance hosts (since alerts are cleared on entering maintenance), so the fleet alerts monitor stays clean.

### Fleet status route

`packages/worker/src/routes/fleet-status.ts` — the existing `switch` only handles `healthy | warning | critical | offline`. Add a `"maintenance"` case that counts into a new `maintenance` bucket (or excludes maintenance hosts from degraded/critical rollup, depending on desired fleet semantics).

Chosen behavior: maintenance hosts are **excluded from fleet health derivation** — they don't count toward healthy, warning, or critical. The fleet response gains a `maintenance` count field:

```typescript
case "maintenance":
    maintenance++;
    break;
```

Fleet `status` is derived from the remaining non-maintenance hosts only. A fleet where all hosts are in maintenance shows `status: "healthy"` with `maintenance: N`.

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
| `packages/worker/src/routes/monitoring.ts` | maintenance-aware tier |
| `packages/worker/src/routes/fleet-status.ts` | maintenance count bucket + exclude from fleet health |
| `packages/worker/src/services/status.ts` | maintenance in deriveHostStatus |
| `packages/worker/src/services/alerts.ts` | clearHostAlerts helper |
| `packages/worker/src/index.ts` | register maintenance routes |
| `packages/worker/src/middleware/api-key.ts` | maintenance mutations as write routes |
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
- Ingest during maintenance: seed window → ingest → verify no alert_states written
- Ingest outside maintenance: same host → ingest → verify alerts evaluated
- Status derivation: host in maintenance → hostsListRoute returns `"maintenance"` status

### Manual verification

1. Set maintenance window via Dashboard → status badge turns purple
2. During window: probe ingest continues, no new alerts, Uptime Kuma shows `"tier":"maintenance"`
3. Outside window: alerts fire normally, status reverts to derived tier
4. Charts show grey overlay bands at correct positions
5. Timezone conversion: set 3:00 AM local → verify stored as correct UTC

---

## Design Decisions (resolved from review)

1. **Alert clearing on maintenance entry**: ✅ Resolved — entering maintenance clears `alert_states` and `alert_pending` for the host. This ensures `/api/monitoring/alerts` reports `alert_count: 0` and the fleet alerts Uptime Kuma monitor stays green. After maintenance ends, all rules re-evaluate from scratch on the next ingest.

2. **Uptime Kuma coordination**: Per-host keyword monitors will go DOWN (`"tier":"maintenance"` ≠ `"tier":"healthy"`). This is acceptable — operators can set Uptime Kuma's own maintenance schedule for the corresponding monitors. Automating this is out of scope for MVP.

3. **DST timezone drift**: Accepted behavior. The window is stored as fixed UTC times. Server-side operations (backups, cron) run on UTC, so a fixed UTC window matches the actual maintenance schedule. Dashboard displays both local and UTC time to make this transparent to the user.

4. **Dashboard WRITE_KEY usage**: Not a new security boundary change. Dashboard already holds `BAT_WRITE_KEY` and uses it for webhook CRUD (POST/DELETE/regenerate) since v0.7.0. Maintenance routes follow the identical auth chain.

5. **fleet-status.ts handling**: Maintenance hosts get their own count bucket and are excluded from fleet health derivation, preventing miscounts in the existing `healthy + warning + critical` breakdown.

6. **PUT/DELETE on missing/retired hosts**: Explicit error responses — 404 for missing host, 403 for retired. No silent 204 on nonexistent targets.
