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

### Key decision: Dashboard → D1 direct, no Worker involvement

Tags are **user-initiated state** — only the Dashboard reads and writes them. The Probe and Worker never touch tags. Therefore:

- **Dashboard connects to D1 directly** via [Cloudflare D1 REST API](https://developers.cloudflare.com/d1/platform/client-api/).
- **No Worker routes** for tags. No new API keys. No proxy layer.
- All tag CRUD happens in Dashboard Next.js API routes, protected by NextAuth session.
- The Worker's hosts list query does NOT include tags — the Dashboard enriches the response client-side or in its own API route by querying D1 separately.

This keeps the existing security model untouched:
- `BAT_WRITE_KEY` stays probe-only.
- `BAT_READ_KEY` stays read-only.
- Tag mutations are gated by NextAuth session (Google OAuth), not by API key.

### D1 REST API access

Dashboard env vars (Railway):
```
CF_API_TOKEN=<token with D1 read/write permission>
CF_ACCOUNT_ID=<cloudflare account id>
CF_D1_DATABASE_ID=<bat-db database id>
```

D1 client helper (`packages/dashboard/src/lib/d1.ts`):
```typescript
interface D1Result<T> {
  results: T[];
  success: boolean;
  meta: { changes: number; last_row_id: number; rows_read: number; rows_written: number };
}

export async function d1Query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<D1Result<T>> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DATABASE_ID}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    },
  );
  const json = await res.json();
  return json.result[0];
}
```

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

`0010_tags.sql` — creates both tables and the index. Non-destructive, additive only. Applied via `wrangler d1 migrations apply` as usual.

---

## Dashboard API Routes

All tag operations are Dashboard-side Next.js API routes that query D1 directly. Protected by NextAuth session — unauthenticated requests get 401.

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

Each route handler:
1. Verify NextAuth session → 401 if missing
2. Validate input (name format, tag exists, host exists, limit not exceeded)
3. Call `d1Query()` with parameterized SQL
4. Return JSON response

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
2. `GET /api/tags/by-hosts` → Dashboard D1 direct → `{ [host_id]: HostTag[] }`

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

- Below subtitle line, render `host.tags.map(t => <TagChip />)`.
- Add `+` icon button that opens `TagSelector` popover.
- Card width may need slight increase to accommodate chips.

---

## Commits (estimated 5)

1. `feat: add tags migration (0010)` — SQL migration file
2. `feat: add D1 REST API client to dashboard` — `lib/d1.ts` helper, env vars
3. `feat: add tag CRUD and assignment API routes` — all Dashboard API routes for tags
4. `feat: add tags management page` — `/tags` page with create/rename/recolor/delete
5. `feat: add tag display and quick-tag to host cards` — host card chips, filter bar, `/api/tags/by-hosts` route

---

## Design Decisions

- **Tag limit per host**: 10 max. Dashboard validates on assignment; returns 422 if exceeded.
- **Tag name constraints**: 1–32 characters, lowercase, allowed chars: `a-z`, `0-9`, `-`, `_`. Validated at creation time. This avoids encoding issues and ensures clean display. Names are stored COLLATE NOCASE but normalized to lowercase on insert.
- **Color assignment**: auto-assign `(SELECT COALESCE(MAX(color), -1) + 1) % 10` on create (round-robin through 10 palette slots). User can override via PUT.
- **No Worker changes**: Worker is completely unaware of tags. This avoids introducing new auth tiers, keeps the Worker's attack surface unchanged, and simplifies the architecture.
- **D1 REST API latency**: Dashboard (Railway, US) → D1 REST API (Cloudflare) adds ~50–100ms per query. Acceptable for tag operations which are infrequent user actions, not high-frequency data paths.
