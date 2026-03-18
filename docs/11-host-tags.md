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

`0010_tags.sql` — creates both tables and the index. Non-destructive, additive only.

---

## API

### Authentication — new `BAT_ADMIN_KEY`

Tags are **user-initiated state changes** (create, rename, delete, assign). The existing two-key model doesn't cover this:

- `BAT_WRITE_KEY` — probe → worker only; probes should never touch tags.
- `BAT_READ_KEY` — dashboard → worker, read-only. If this key leaks (e.g. Railway env exposure), an attacker can read host data but cannot mutate state.

Putting tag mutations behind `BAT_READ_KEY` would violate this invariant. Instead, introduce a **third key**:

- `BAT_ADMIN_KEY` — dashboard → worker, for state-mutating operations initiated by authenticated users (tag CRUD, tag assignment, future: host retire, alert ack).
- Stored as a Worker secret alongside the existing two keys.
- Dashboard holds it in env and proxies it only for mutation requests, after verifying the user's NextAuth session.

**Middleware change** (`middleware/api-key.ts`):
- Add `ADMIN_ROUTES` array: `["/api/tags", "/api/hosts/*/tags"]` (prefix match for these paths + POST/PUT/DELETE methods).
- For admin routes: validate against `BAT_ADMIN_KEY`.
- GET requests to `/api/tags` and `/api/hosts/:id/tags` remain under `BAT_READ_KEY` (read-only access).
- Route classification order: public → write → admin (method + path check) → read (fallthrough).

### Tag CRUD

| Method | Route | Auth | Body | Response | Description |
|--------|-------|------|------|----------|-------------|
| `GET` | `/api/tags` | Read Key | — | `TagItem[]` | List all tags (with host count) |
| `POST` | `/api/tags` | Admin Key | `{ name, color? }` | `TagItem` | Create tag |
| `PUT` | `/api/tags/:id` | Admin Key | `{ name?, color? }` | `TagItem` | Update tag |
| `DELETE` | `/api/tags/:id` | Admin Key | — | `204` | Delete tag + cascade from host_tags |

### Host ↔ Tag assignment

| Method | Route | Auth | Body | Response | Description |
|--------|-------|------|------|----------|-------------|
| `GET` | `/api/hosts/:id/tags` | Read Key | — | `HostTag[]` | Tags for a host |
| `PUT` | `/api/hosts/:id/tags` | Admin Key | `{ tag_ids: number[] }` | `HostTag[]` | Replace host's tags (set semantics) |
| `POST` | `/api/hosts/:id/tags` | Admin Key | `{ tag_id: number }` | `HostTag` | Add one tag |
| `DELETE` | `/api/hosts/:id/tags/:tagId` | Admin Key | — | `204` | Remove one tag |

### Shared types (`packages/shared/src/api.ts`)

Two separate interfaces — management context vs host context:

```typescript
/** Full tag info — returned by /api/tags (management page). */
export interface TagItem {
  id: number;
  name: string;
  color: number;
  host_count: number;  // only populated for /api/tags list
}

/** Lightweight tag reference — embedded in HostOverviewItem and host-scoped routes. */
export interface HostTag {
  id: number;
  name: string;
  color: number;
}
```

Extend `HostOverviewItem`:
```typescript
tags: HostTag[];  // populated via JOIN in hosts list query — no host_count needed
```

### Hosts list query change

Current query fetches hosts + latest metrics. Add tag data via one of two approaches:

**Option A — Separate batch query** (chosen):
```sql
-- After fetching host list, batch-query all tags:
SELECT ht.host_id, t.id, t.name, t.color
FROM host_tags ht JOIN tags t ON t.id = ht.tag_id
WHERE ht.host_id IN (?, ?, ...)
ORDER BY t.name ASC
```
Group results by `host_id` in the route handler → `HostTag[]` per host.

This avoids GROUP_CONCAT encoding issues entirely. For a fleet of < 50 hosts with < 10 tags each, a second D1 query is negligible. The previous GROUP_CONCAT approach was rejected because delimiter-based encoding breaks when tag names contain the delimiter characters, and D1 SQLite lacks `json_group_array`.

**Option B — GROUP_CONCAT with JSON encoding**: Rejected. D1 doesn't support `json_group_array`, and custom delimiter encoding (`:`, `|`) is fragile against freeform tag names.

---

## Dashboard Routes (Proxy)

Add proxy routes in `packages/dashboard/src/app/api/`:

| Dashboard route file | Methods | Proxies to Worker | Auth key used |
|---------------------|---------|-------------------|---------------|
| `/api/tags/route.ts` | GET | `GET /api/tags` | `BAT_READ_KEY` |
| `/api/tags/route.ts` | POST | `POST /api/tags` | `BAT_ADMIN_KEY` |
| `/api/tags/[id]/route.ts` | PUT, DELETE | `PUT/DELETE /api/tags/:id` | `BAT_ADMIN_KEY` |
| `/api/hosts/[id]/tags/route.ts` | GET | `GET /api/hosts/:id/tags` | `BAT_READ_KEY` |
| `/api/hosts/[id]/tags/route.ts` | PUT, POST | `PUT/POST /api/hosts/:id/tags` | `BAT_ADMIN_KEY` |
| `/api/hosts/[id]/tags/[tagId]/route.ts` | DELETE | `DELETE /api/hosts/:id/tags/:tagId` | `BAT_ADMIN_KEY` |

Each proxy route verifies the user's NextAuth session before forwarding. Mutation routes (POST/PUT/DELETE) use `BAT_ADMIN_KEY`; read routes (GET) use `BAT_READ_KEY`.

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

- Below subtitle line, render `host.tags.map(t => <TagChip />)`.
- Add `+` icon button that opens `TagSelector` popover.
- Card width may need slight increase to accommodate chips.

---

## Commits (estimated 6)

1. `feat: add BAT_ADMIN_KEY auth tier to worker middleware` — new key type, ADMIN_ROUTES classification, method-aware routing
2. `feat: add tags migration (0010)` — SQL migration file
3. `feat: add tag CRUD routes to worker` — worker routes + shared types (TagItem, HostTag)
4. `feat: add tag assignment routes to worker` — host↔tag routes
5. `feat: add tags management page to dashboard` — /tags page + all proxy routes (including [id] and [tagId] variants)
6. `feat: add tag display and quick-tag to host cards` — host card chips, filter bar

---

## Design Decisions

- **Tag limit per host**: 10 max. Worker validates on assignment; returns 422 if exceeded.
- **Tag name constraints**: 1–32 characters, lowercase, allowed chars: `a-z`, `0-9`, `-`, `_`. Validated at creation time (worker rejects non-conforming names with 400). This avoids encoding issues and ensures clean URL slugs. Names are stored COLLATE NOCASE but normalized to lowercase on insert.
- **Color assignment**: auto-assign `(SELECT COALESCE(MAX(color), -1) + 1) % 10` on create (round-robin through 10 palette slots). User can override via PUT.
