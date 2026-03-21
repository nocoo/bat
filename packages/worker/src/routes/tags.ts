// Tag CRUD routes — all require BAT_READ_KEY (reads) or BAT_WRITE_KEY (mutations)
// GET    /api/tags              — list all tags with host_count
// POST   /api/tags              — create tag
// PUT    /api/tags/:id          — update tag (rename/recolor)
// DELETE /api/tags/:id          — delete tag (cascade removes host_tags)
// GET    /api/tags/by-hosts     — all host→tag mappings grouped by host_id
// GET    /api/hosts/:id/tags    — tags for a specific host
// POST   /api/hosts/:id/tags    — add one tag to host
// PUT    /api/hosts/:id/tags    — replace host's tags (set semantics)
// DELETE /api/hosts/:id/tags/:tagId — remove one tag from host
//
// Note: host-scoped routes accept raw host_id only (not 8-char hid).
// Dashboard always sends raw host_id for tag/port operations.

import { type HostTag, MAX_TAGS_PER_HOST, TAG_COLOR_COUNT, TAG_NAME_REGEX } from "@bat/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";

// ---------------------------------------------------------------------------
// Tag CRUD
// ---------------------------------------------------------------------------

/** GET /api/tags */
export async function tagsListRoute(c: Context<AppEnv>) {
	const db = c.env.DB;

	const result = await db
		.prepare(
			`SELECT t.id, t.name, t.color,
			        (SELECT COUNT(*) FROM host_tags ht WHERE ht.tag_id = t.id) as host_count
			 FROM tags t
			 ORDER BY t.name ASC`,
		)
		.all<{ id: number; name: string; color: number; host_count: number }>();

	return c.json(result.results);
}

/** POST /api/tags */
export async function tagsCreateRoute(c: Context<AppEnv>) {
	const db = c.env.DB;

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	if (!body || typeof body !== "object") {
		return c.json({ error: "Invalid payload" }, 400);
	}

	const payload = body as Record<string, unknown>;
	const rawName = typeof payload.name === "string" ? payload.name.trim().toLowerCase() : "";

	if (!rawName || !TAG_NAME_REGEX.test(rawName)) {
		return c.json({ error: "Invalid tag name. Must be 1-32 chars: a-z, 0-9, -, _" }, 400);
	}

	// Auto-assign color (round-robin) unless specified
	const colorProvided =
		typeof payload.color === "number" && payload.color >= 0 && payload.color < TAG_COLOR_COUNT;

	try {
		let row: { id: number; name: string; color: number } | null;

		if (colorProvided) {
			row = await db
				.prepare("INSERT INTO tags (name, color) VALUES (?, ?) RETURNING id, name, color")
				.bind(rawName, payload.color)
				.first<{ id: number; name: string; color: number }>();
		} else {
			row = await db
				.prepare(
					`INSERT INTO tags (name, color)
					 VALUES (?, (SELECT COALESCE(MAX(color), -1) + 1 FROM tags) % ?)
					 RETURNING id, name, color`,
				)
				.bind(rawName, TAG_COLOR_COUNT)
				.first<{ id: number; name: string; color: number }>();
		}

		if (!row) {
			return c.json({ error: "Failed to create tag" }, 500);
		}

		return c.json({ ...row, host_count: 0 }, 201);
	} catch (err) {
		if (err instanceof Error && err.message.includes("UNIQUE")) {
			return c.json({ error: "Tag with this name already exists" }, 409);
		}
		throw err;
	}
}

/** PUT /api/tags/:id */
export async function tagsUpdateRoute(c: Context<AppEnv, "/api/tags/:id">) {
	const db = c.env.DB;

	const idParam = c.req.param("id");
	const tagId = Number.parseInt(idParam, 10);
	if (Number.isNaN(tagId)) {
		return c.json({ error: "Invalid tag ID" }, 400);
	}

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	if (!body || typeof body !== "object") {
		return c.json({ error: "Invalid payload" }, 400);
	}

	const payload = body as Record<string, unknown>;

	// Build SET clause dynamically
	const sets: string[] = [];
	const values: unknown[] = [];

	if (payload.name !== undefined) {
		const name = typeof payload.name === "string" ? payload.name.trim().toLowerCase() : "";
		if (!TAG_NAME_REGEX.test(name)) {
			return c.json({ error: "Invalid tag name. Must be 1-32 chars: a-z, 0-9, -, _" }, 400);
		}
		sets.push("name = ?");
		values.push(name);
	}

	if (payload.color !== undefined) {
		if (
			typeof payload.color !== "number" ||
			payload.color < 0 ||
			payload.color >= TAG_COLOR_COUNT
		) {
			return c.json({ error: `Color must be 0-${TAG_COLOR_COUNT - 1}` }, 400);
		}
		sets.push("color = ?");
		values.push(payload.color);
	}

	if (sets.length === 0) {
		return c.json({ error: "Nothing to update" }, 400);
	}

	values.push(tagId);

	try {
		const result = await db
			.prepare(`UPDATE tags SET ${sets.join(", ")} WHERE id = ? RETURNING id, name, color`)
			.bind(...values)
			.first<{ id: number; name: string; color: number }>();

		if (!result) {
			return c.json({ error: "Tag not found" }, 404);
		}

		return c.json(result);
	} catch (err) {
		if (err instanceof Error && err.message.includes("UNIQUE")) {
			return c.json({ error: "Tag with this name already exists" }, 409);
		}
		throw err;
	}
}

/** DELETE /api/tags/:id */
export async function tagsDeleteRoute(c: Context<AppEnv, "/api/tags/:id">) {
	const db = c.env.DB;

	const idParam = c.req.param("id");
	const tagId = Number.parseInt(idParam, 10);
	if (Number.isNaN(tagId)) {
		return c.json({ error: "Invalid tag ID" }, 400);
	}

	const result = await db.prepare("DELETE FROM tags WHERE id = ?").bind(tagId).run();

	if (result.meta.changes === 0) {
		return c.json({ error: "Tag not found" }, 404);
	}

	return c.body(null, 204);
}

// ---------------------------------------------------------------------------
// Tags by hosts (bulk lookup)
// ---------------------------------------------------------------------------

/** GET /api/tags/by-hosts */
export async function tagsByHostsRoute(c: Context<AppEnv>) {
	const db = c.env.DB;

	const result = await db
		.prepare(
			`SELECT ht.host_id, t.id, t.name, t.color
			 FROM host_tags ht JOIN tags t ON t.id = ht.tag_id
			 ORDER BY t.name ASC`,
		)
		.all<{ host_id: string; id: number; name: string; color: number }>();

	// Group by host_id
	const map: Record<string, HostTag[]> = {};
	for (const row of result.results) {
		const list = map[row.host_id] ?? [];
		list.push({ id: row.id, name: row.name, color: row.color });
		map[row.host_id] = list;
	}

	return c.json(map);
}

// ---------------------------------------------------------------------------
// Host ↔ Tag assignments
// ---------------------------------------------------------------------------

/** GET /api/hosts/:id/tags */
export async function hostTagsListRoute(c: Context<AppEnv, "/api/hosts/:id/tags">) {
	const db = c.env.DB;
	const hostId = c.req.param("id");

	const result = await db
		.prepare(
			`SELECT t.id, t.name, t.color
			 FROM host_tags ht JOIN tags t ON t.id = ht.tag_id
			 WHERE ht.host_id = ?
			 ORDER BY t.name ASC`,
		)
		.bind(hostId)
		.all<HostTag>();

	return c.json(result.results);
}

/** POST /api/hosts/:id/tags */
export async function hostTagsAddRoute(c: Context<AppEnv, "/api/hosts/:id/tags">) {
	const db = c.env.DB;
	const hostId = c.req.param("id");

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	if (!body || typeof body !== "object") {
		return c.json({ error: "Invalid payload" }, 400);
	}

	const payload = body as Record<string, unknown>;
	if (typeof payload.tag_id !== "number") {
		return c.json({ error: "tag_id is required" }, 400);
	}

	// Verify host exists
	const host = await db
		.prepare("SELECT host_id FROM hosts WHERE host_id = ?")
		.bind(hostId)
		.first<{ host_id: string }>();
	if (!host) {
		return c.json({ error: "Host not found" }, 404);
	}

	// Check tag limit
	const countRow = await db
		.prepare("SELECT COUNT(*) as cnt FROM host_tags WHERE host_id = ?")
		.bind(hostId)
		.first<{ cnt: number }>();
	if ((countRow?.cnt ?? 0) >= MAX_TAGS_PER_HOST) {
		return c.json({ error: `Maximum ${MAX_TAGS_PER_HOST} tags per host` }, 422);
	}

	// Verify tag exists
	const tag = await db
		.prepare("SELECT id, name, color FROM tags WHERE id = ?")
		.bind(payload.tag_id)
		.first<{ id: number; name: string; color: number }>();
	if (!tag) {
		return c.json({ error: "Tag not found" }, 404);
	}

	// Insert (ignore if already assigned)
	await db
		.prepare("INSERT OR IGNORE INTO host_tags (host_id, tag_id) VALUES (?, ?)")
		.bind(hostId, payload.tag_id)
		.run();

	return c.json(tag, 201);
}

/** PUT /api/hosts/:id/tags — replace all tags */
export async function hostTagsReplaceRoute(c: Context<AppEnv, "/api/hosts/:id/tags">) {
	const db = c.env.DB;
	const hostId = c.req.param("id");

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	if (!body || typeof body !== "object") {
		return c.json({ error: "Invalid payload" }, 400);
	}

	const payload = body as Record<string, unknown>;
	if (!Array.isArray(payload.tag_ids)) {
		return c.json({ error: "tag_ids array is required" }, 400);
	}

	const tagIds = payload.tag_ids as number[];
	if (tagIds.length > MAX_TAGS_PER_HOST) {
		return c.json({ error: `Maximum ${MAX_TAGS_PER_HOST} tags per host` }, 422);
	}

	// Verify host exists
	const host = await db
		.prepare("SELECT host_id FROM hosts WHERE host_id = ?")
		.bind(hostId)
		.first<{ host_id: string }>();
	if (!host) {
		return c.json({ error: "Host not found" }, 404);
	}

	// Verify all tag_ids exist
	if (tagIds.length > 0) {
		const placeholders = tagIds.map(() => "?").join(", ");
		const existingTags = await db
			.prepare(`SELECT id FROM tags WHERE id IN (${placeholders})`)
			.bind(...tagIds)
			.all<{ id: number }>();
		if (existingTags.results.length !== tagIds.length) {
			const found = new Set(existingTags.results.map((t) => t.id));
			const missing = tagIds.filter((id) => !found.has(id));
			return c.json({ error: `Tags not found: ${missing.join(", ")}` }, 404);
		}
	}

	// Delete all existing, then insert new
	await db.prepare("DELETE FROM host_tags WHERE host_id = ?").bind(hostId).run();

	if (tagIds.length > 0) {
		const placeholders = tagIds.map(() => "(?, ?)").join(", ");
		const values = tagIds.flatMap((tagId) => [hostId, tagId]);
		await db
			.prepare(`INSERT OR IGNORE INTO host_tags (host_id, tag_id) VALUES ${placeholders}`)
			.bind(...values)
			.run();
	}

	// Return updated tag list
	const result = await db
		.prepare(
			`SELECT t.id, t.name, t.color
			 FROM host_tags ht JOIN tags t ON t.id = ht.tag_id
			 WHERE ht.host_id = ?
			 ORDER BY t.name ASC`,
		)
		.bind(hostId)
		.all<HostTag>();

	return c.json(result.results);
}

/** DELETE /api/hosts/:id/tags/:tagId */
export async function hostTagsRemoveRoute(c: Context<AppEnv, "/api/hosts/:id/tags/:tagId">) {
	const db = c.env.DB;
	const hostId = c.req.param("id");
	const tagIdParam = c.req.param("tagId");
	const tagId = Number.parseInt(tagIdParam, 10);

	if (Number.isNaN(tagId)) {
		return c.json({ error: "Invalid tag ID" }, 400);
	}

	const result = await db
		.prepare("DELETE FROM host_tags WHERE host_id = ? AND tag_id = ?")
		.bind(hostId, tagId)
		.run();

	if (result.meta.changes === 0) {
		return c.json({ error: "Tag assignment not found" }, 404);
	}

	return c.body(null, 204);
}
