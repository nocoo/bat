// PUT /api/tags/:id — Update tag (rename/recolor)
// DELETE /api/tags/:id — Delete tag (cascade removes host_tags)
// D1 direct. Spec: docs/11-host-tags.md

import { auth } from "@/auth";
import { d1Query } from "@/lib/d1";
import { TAG_COLOR_COUNT, TAG_NAME_REGEX } from "@bat/shared";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;
	const tagId = Number(id);
	if (Number.isNaN(tagId)) {
		return Response.json({ error: "Invalid tag ID" }, { status: 400 });
	}

	const body = (await request.json()) as { name?: string; color?: number };

	// Build SET clause dynamically
	const sets: string[] = [];
	const values: unknown[] = [];

	if (body.name !== undefined) {
		const name = body.name.trim().toLowerCase();
		if (!TAG_NAME_REGEX.test(name)) {
			return Response.json(
				{ error: "Invalid tag name. Must be 1-32 chars: a-z, 0-9, -, _" },
				{ status: 400 },
			);
		}
		sets.push("name = ?");
		values.push(name);
	}

	if (body.color !== undefined) {
		if (body.color < 0 || body.color >= TAG_COLOR_COUNT) {
			return Response.json({ error: `Color must be 0-${TAG_COLOR_COUNT - 1}` }, { status: 400 });
		}
		sets.push("color = ?");
		values.push(body.color);
	}

	if (sets.length === 0) {
		return Response.json({ error: "Nothing to update" }, { status: 400 });
	}

	values.push(tagId);
	const result = await d1Query<{ id: number; name: string; color: number }>(
		`UPDATE tags SET ${sets.join(", ")} WHERE id = ? RETURNING id, name, color`,
		values,
	);

	if (result.results.length === 0) {
		return Response.json({ error: "Tag not found" }, { status: 404 });
	}

	return Response.json(result.results[0]);
}

export async function DELETE(_request: Request, { params }: Params) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await params;
	const tagId = Number(id);
	if (Number.isNaN(tagId)) {
		return Response.json({ error: "Invalid tag ID" }, { status: 400 });
	}

	// ON DELETE CASCADE in host_tags handles cleanup
	const result = await d1Query("DELETE FROM tags WHERE id = ?", [tagId]);

	if (result.meta.changes === 0) {
		return Response.json({ error: "Tag not found" }, { status: 404 });
	}

	return new Response(null, { status: 204 });
}
