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

All tag routes live under `/api/tags` and `/api/hosts/:id/tags`, gated by `BAT_READ_KEY` (same as other dashboard→worker read routes).

### Tag CRUD

| Method | Route | Body | Response | Description |
|--------|-------|------|----------|-------------|
| `GET` | `/api/tags` | — | `TagItem[]` | List all tags (with host count) |
| `POST` | `/api/tags` | `{ name, color? }` | `TagItem` | Create tag |
| `PUT` | `/api/tags/:id` | `{ name?, color? }` | `TagItem` | Update tag |
| `DELETE` | `/api/tags/:id` | — | `204` | Delete tag + cascade from host_tags |

### Host ↔ Tag assignment

| Method | Route | Body | Response | Description |
|--------|-------|------|----------|-------------|
| `GET` | `/api/hosts/:id/tags` | — | `TagItem[]` | Tags for a host |
| `PUT` | `/api/hosts/:id/tags` | `{ tag_ids: number[] }` | `TagItem[]` | Replace host's tags (set semantics) |
| `POST` | `/api/hosts/:id/tags` | `{ tag_id: number }` | `TagItem` | Add one tag |
| `DELETE` | `/api/hosts/:id/tags/:tagId` | — | `204` | Remove one tag |

### Shared types (`packages/shared/src/api.ts`)

```typescript
export interface TagItem {
  id: number;
  name: string;
  color: number;
  host_count: number;
}
```

Extend `HostOverviewItem`:
```typescript
tags: TagItem[];  // populated via JOIN in hosts list query
```

### Hosts list query change

Current query fetches hosts + latest metrics. Add a LEFT JOIN or subquery to include tag data. Two approaches:

**Option A — Subquery with GROUP_CONCAT** (preferred for D1, avoids row multiplication):
```sql
SELECT h.*,
  (SELECT GROUP_CONCAT(t.id || ':' || t.name || ':' || t.color, '|')
   FROM host_tags ht JOIN tags t ON t.id = ht.tag_id
   WHERE ht.host_id = h.host_id) AS tags_csv
FROM hosts h WHERE h.is_active = 1
```
Parse `tags_csv` in the route handler → `TagItem[]`.

**Option B — Separate query**: After fetching hosts, batch-query all tags for those host_ids. Simpler, two queries.

Choose Option A for fewer round-trips.

---

## Dashboard Routes (Proxy)

Add proxy routes in `packages/dashboard/src/app/api/`:
- `/api/tags/route.ts` — proxies to worker `/api/tags`
- `/api/hosts/[id]/tags/route.ts` — proxies to worker `/api/hosts/:id/tags`

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

## Commits (estimated 5)

1. `feat: add tags migration (0010)` — SQL migration file
2. `feat: add tag CRUD routes to worker` — worker routes + shared types
3. `feat: add tag assignment routes to worker` — host↔tag routes
4. `feat: add tags management page to dashboard` — /tags page + proxy routes
5. `feat: add tag display and quick-tag to host cards` — host card chips, filter bar

---

## Open Questions

- **Tag limit per host**: cap at 10? Or unlimited?
- **Tag name constraints**: max length 32, alphanumeric + hyphens + underscores? Or freeform?
- **Color assignment**: auto-assign next available color on create, or user picks?
