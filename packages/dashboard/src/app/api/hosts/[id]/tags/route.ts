// GET /api/hosts/:id/tags — Tags for a host
// POST /api/hosts/:id/tags — Add one tag to host
// PUT /api/hosts/:id/tags — Replace host's tags (set semantics)
// D1 direct. Spec: docs/11-host-tags.md

import { auth } from "@/auth";
import { d1Query } from "@/lib/d1";
import { MAX_TAGS_PER_HOST } from "@bat/shared";
import type { HostTag } from "@bat/shared";

type Params = { params: Promise<{ id: string }> };

/** Verify host exists in hosts table. Returns true if found. */
async function hostExists(hostId: string): Promise<boolean> {
	const result = await d1Query<{ host_id: string }>(
		"SELECT host_id FROM hosts WHERE host_id = ? LIMIT 1",
		[hostId],
	);
	return result.results.length > 0;
}

export async function GET(_request: Request, { params }: Params) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id: hostId } = await params;

	const result = await d1Query<HostTag>(
		`SELECT t.id, t.name, t.color
		 FROM host_tags ht JOIN tags t ON t.id = ht.tag_id
		 WHERE ht.host_id = ?
		 ORDER BY t.name ASC`,
		[hostId],
	);

	return Response.json(result.results);
}

export async function POST(request: Request, { params }: Params) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id: hostId } = await params;
	const body = (await request.json()) as { tag_id?: number };

	if (!body.tag_id || typeof body.tag_id !== "number") {
		return Response.json({ error: "tag_id is required" }, { status: 400 });
	}

	// Verify host exists
	if (!(await hostExists(hostId))) {
		return Response.json({ error: "Host not found" }, { status: 404 });
	}

	// Check tag limit
	const countResult = await d1Query<{ cnt: number }>(
		"SELECT COUNT(*) as cnt FROM host_tags WHERE host_id = ?",
		[hostId],
	);
	if ((countResult.results[0]?.cnt ?? 0) >= MAX_TAGS_PER_HOST) {
		return Response.json({ error: `Maximum ${MAX_TAGS_PER_HOST} tags per host` }, { status: 422 });
	}

	// Verify tag exists
	const tagCheck = await d1Query<{ id: number; name: string; color: number }>(
		"SELECT id, name, color FROM tags WHERE id = ?",
		[body.tag_id],
	);
	if (tagCheck.results.length === 0) {
		return Response.json({ error: "Tag not found" }, { status: 404 });
	}

	// Insert (ignore if already assigned)
	await d1Query("INSERT OR IGNORE INTO host_tags (host_id, tag_id) VALUES (?, ?)", [
		hostId,
		body.tag_id,
	]);

	return Response.json(tagCheck.results[0], { status: 201 });
}

export async function PUT(request: Request, { params }: Params) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id: hostId } = await params;
	const body = (await request.json()) as { tag_ids?: number[] };

	if (!Array.isArray(body.tag_ids)) {
		return Response.json({ error: "tag_ids array is required" }, { status: 400 });
	}

	if (body.tag_ids.length > MAX_TAGS_PER_HOST) {
		return Response.json({ error: `Maximum ${MAX_TAGS_PER_HOST} tags per host` }, { status: 422 });
	}

	// Verify host exists before any mutations
	if (!(await hostExists(hostId))) {
		return Response.json({ error: "Host not found" }, { status: 404 });
	}

	// Verify all tag_ids exist before any mutations
	if (body.tag_ids.length > 0) {
		const placeholders = body.tag_ids.map(() => "?").join(", ");
		const existingTags = await d1Query<{ id: number }>(
			`SELECT id FROM tags WHERE id IN (${placeholders})`,
			body.tag_ids,
		);
		if (existingTags.results.length !== body.tag_ids.length) {
			const found = new Set(existingTags.results.map((t) => t.id));
			const missing = body.tag_ids.filter((id) => !found.has(id));
			return Response.json({ error: `Tags not found: ${missing.join(", ")}` }, { status: 404 });
		}
	}

	// Safe to mutate — delete all existing, then insert new
	await d1Query("DELETE FROM host_tags WHERE host_id = ?", [hostId]);

	if (body.tag_ids.length > 0) {
		const placeholders = body.tag_ids.map(() => "(?, ?)").join(", ");
		const values = body.tag_ids.flatMap((tagId) => [hostId, tagId]);
		await d1Query(
			`INSERT OR IGNORE INTO host_tags (host_id, tag_id) VALUES ${placeholders}`,
			values,
		);
	}

	// Return updated tag list
	const result = await d1Query<HostTag>(
		`SELECT t.id, t.name, t.color
		 FROM host_tags ht JOIN tags t ON t.id = ht.tag_id
		 WHERE ht.host_id = ?
		 ORDER BY t.name ASC`,
		[hostId],
	);

	return Response.json(result.results);
}
