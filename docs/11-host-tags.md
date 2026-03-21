# 11 — Host Tags

## Overview

Allow users to tag hosts with arbitrary labels (e.g. `production`, `us-east`, `database`, `web`). Tags enable visual grouping, filtering on the hosts page, and future alert scoping.

## User-Facing Behavior

### Hosts page (`/hosts`)

- Each host card shows its tags as small colored chips below the subtitle line.
- A "Filter by tag" pill bar sits above the card grid. Clicking a tag filters the list. Multiple tags use AND logic.
- Each card has a **＋** button to quick-add a tag (autocomplete from existing tags).
- Clicking an existing tag chip on a card opens a popover: rename (globally) or remove from this host.

### Tags management page (`/tags`)

- Standalone page linked from the sidebar.
- Lists all tags with: name, color, host count.
- Actions: create, rename, recolor, delete.
- Deleting a tag removes it from all hosts.
- Color is a palette index (8–10 preset colors, stored as integer 0–N). Dashboard maps index → CSS class.

---

## Architecture

### Key decision: Dashboard → Worker proxy (all D1 access through Worker)

Tags are **user-initiated state** — the Dashboard reads and writes them via Worker routes. The Probe never touches tags. The Worker has full CRUD access to `tags` and `host_tags` tables, including read-only access for the monitoring aggregation API (see [16-monitoring-api § Architecture Decision](./16-monitoring-api.md#architecture-decision-worker-reads-tags-read-only)).

- **Dashboard proxies all tag operations through the Worker** — same pattern as hosts, alerts, webhooks, and maintenance.
- Tag mutations use `BAT_WRITE_KEY`; reads use `BAT_READ_KEY`.
- All tag operations are protected by NextAuth session on the Dashboard side.
- The Worker's hosts list query does NOT include tags — the Dashboard enriches the response client-side by querying `/api/tags/by-hosts` separately.

---

## Data Model

### New table: `tags`

```sql
CREATE TABLE tags (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color    INTEGER NOT NULL DEFAULT 0,      -- palette index 0..9
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### New table: `host_tags` (junction)

```sql
CREATE TABLE host_tags (
  host_id  TEXT    NOT NULL REFERENCES hosts(host_id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (host_id, tag_id)
);
CREATE INDEX idx_host_tags_tag ON host_tags(tag_id);
```

### Migration

`0010_tags.sql` — creates both tables and the index. Non-destructive, additive only. Applied via `wrangler d1 execute bat-db --file=migrations/0010_tags.sql` (see [03-data-structures.md § D1 Migration Strategy](./03-data-structures.md)).

---

## API Routes

Tag CRUD is handled by Worker routes (`packages/worker/src/routes/tags.ts`). Dashboard routes are thin proxies (auth check + forward to Worker). Protected by NextAuth session — unauthenticated requests get 401.

### Tag CRUD (`/api/tags`)

| Method | Route | Body | Response | Description |
|--------|-------|------|----------|-------------|
| `GET` | `/api/tags` | — | `TagItem[]` | List all tags with host count |
| `POST` | `/api/tags` | `{ name, color? }` | `TagItem` | Create tag |

### Tag by ID (`/api/tags/[id]`)

| Method | Route | Body | Response | Description |
|--------|-------|------|----------|-------------|
| `PUT` | `/api/tags/:id` | `{ name?, color? }` | `TagItem` | Update tag |
| `DELETE` | `/api/tags/:id` | — | `204` | Delete tag (cascade removes host_tags) |

### Host ↔ Tag assignment (`/api/hosts/[id]/tags`)

| Method | Route | Body | Response | Description |
|--------|-------|------|----------|-------------|
| `GET` | `/api/hosts/:id/tags` | — | `HostTag[]` | Tags for a host |
| `PUT` | `/api/hosts/:id/tags` | `{ tag_ids: number[] }` | `HostTag[]` | Replace host's tags (set semantics) |
| `POST` | `/api/hosts/:id/tags` | `{ tag_id: number }` | `HostTag` | Add one tag |

### Remove tag from host (`/api/hosts/[id]/tags/[tagId]`)

| Method | Route | Body | Response | Description |
|--------|-------|------|----------|-------------|
| `DELETE` | `/api/hosts/:id/tags/:tagId` | — | `204` | Remove one tag from host |

### Implementation pattern

Each Worker route handler:
1. Validate input (name format, tag exists, host exists, limit not exceeded)
2. Execute D1 query via `c.env.DB` native binding
3. Return JSON response

Dashboard route handlers:
1. Verify NextAuth session → 401 if missing
2. Proxy to Worker via `proxyToWorker()` / `proxyToWorkerWithBody()`

---

## Shared Types (`packages/shared/src/api.ts`)

Two separate interfaces — management context vs host context:

```typescript
/** Full tag info — returned by GET /api/tags (management page). */
export interface TagItem {
  id: number;
  name: string;
  color: number;
  host_count: number;  // only populated for tag list
}

/** Lightweight tag reference — embedded in host cards. */
export interface HostTag {
  id: number;
  name: string;
  color: number;
}
```

---

## Hosts page integration

The hosts page currently fetches host data from Worker via `GET /api/hosts` (proxied through Dashboard). Tags are NOT part of that response — they live in a separate data path.

**Approach**: The hosts page makes two parallel requests:
1. `GET /api/hosts` → Worker (via existing proxy) → host list with metrics
2. `GET /api/tags/by-hosts` → Worker (via proxy) → `{ [host_id]: HostTag[] }`

New Dashboard route `/api/tags/by-hosts/route.ts`:
```sql
SELECT ht.host_id, t.id, t.name, t.color
FROM host_tags ht JOIN tags t ON t.id = ht.tag_id
ORDER BY t.name ASC
```
Returns a map of `host_id → HostTag[]`. Client merges the two responses.

This keeps the Worker completely unaware of tags.

---

## Dashboard UI

### Components

- `TagChip` — small colored pill component. Props: `name`, `color`, `onRemove?`.
- `TagSelector` — autocomplete dropdown to search/create tags. Uses existing tags list for autocomplete, "Create new" option at bottom.
- `TagFilterBar` — horizontal pill bar above card grid for filtering.

### Tags page (`/tags`)

- Table layout: Name (editable inline), Color (swatches), Hosts (count badge), Actions (delete).
- "New tag" button at top.
- Sidebar link with tag icon.

### Host card changes

- Below subtitle line, render tags as `<TagChip />` components. The tags come from the page-level ViewModel — the hosts page merges `GET /api/hosts` (Worker) and `GET /api/tags/by-hosts` (Worker) into a combined view. `HostOverviewItem` itself does NOT contain tags.
- Add `+` icon button that opens `TagSelector` popover.
- Card width may need slight increase to accommodate chips.

---

## Commits (estimated 4)

1. `feat: add tags migration (0010)` — SQL migration file
2. `feat: add tag CRUD routes to worker` — Worker routes for all tag operations
3. `feat: add tags management page` — `/tags` page with create/rename/recolor/delete
4. `feat: add tag display and quick-tag to host cards` — host card chips, filter bar, `/api/tags/by-hosts` route

---

## Design Decisions

- **Tag limit per host**: 10 max. Dashboard validates on assignment; returns 422 if exceeded.
- **Tag name constraints**: 1–32 characters, lowercase, allowed chars: `a-z`, `0-9`, `-`, `_`. Validated at creation time. This avoids encoding issues and ensures clean display. Names are stored COLLATE NOCASE but normalized to lowercase on insert.
- **Color assignment**: auto-assign `(SELECT COALESCE(MAX(color), -1) + 1) % 10` on create (round-robin through 10 palette slots). User can override via PUT.
- **No Worker changes**: Tag CRUD routes live in the Worker alongside hosts/alerts/webhooks, using the same `BAT_WRITE_KEY`/`BAT_READ_KEY` auth model. Dashboard is a thin proxy.
- **D1 REST API latency**: Dashboard (Railway, US) → D1 REST API (Cloudflare) adds ~50–100ms per query. Acceptable for tag operations which are infrequent user actions, not high-frequency data paths.
