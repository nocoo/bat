// GET /api/tags — List all tags with host count
// POST /api/tags — Create a new tag
// D1 direct (not proxied to Worker). Spec: docs/11-host-tags.md

import { auth } from "@/auth";
import { d1Query } from "@/lib/d1";
import { TAG_COLOR_COUNT, TAG_NAME_REGEX } from "@bat/shared";

interface TagRow {
	id: number;
	name: string;
	color: number;
	host_count: number;
}

export async function GET() {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const result = await d1Query<TagRow>(
		`SELECT t.id, t.name, t.color,
		        (SELECT COUNT(*) FROM host_tags ht WHERE ht.tag_id = t.id) as host_count
		 FROM tags t
		 ORDER BY t.name ASC`,
	);

	return Response.json(result.results);
}

export async function POST(request: Request) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await request.json()) as { name?: string; color?: number };
	const name = body.name?.trim().toLowerCase();

	if (!name || !TAG_NAME_REGEX.test(name)) {
		return Response.json(
			{ error: "Invalid tag name. Must be 1-32 chars: a-z, 0-9, -, _" },
			{ status: 400 },
		);
	}

	// Auto-assign color (round-robin) unless specified
	const color =
		body.color !== undefined && body.color >= 0 && body.color < TAG_COLOR_COUNT ? body.color : null;

	let result: { id: number; name: string; color: number } | undefined;

	if (color !== null) {
		const res = await d1Query<{ id: number; name: string; color: number }>(
			"INSERT INTO tags (name, color) VALUES (?, ?) RETURNING id, name, color",
			[name, color],
		);
		result = res.results[0];
	} else {
		// Auto-assign: round-robin through palette slots
		const res = await d1Query<{ id: number; name: string; color: number }>(
			`INSERT INTO tags (name, color)
			 VALUES (?, (SELECT COALESCE(MAX(color), -1) + 1 FROM tags) % ?)
			 RETURNING id, name, color`,
			[name, TAG_COLOR_COUNT],
		);
		result = res.results[0];
	}

	if (!result) {
		return Response.json({ error: "Failed to create tag" }, { status: 500 });
	}

	return Response.json({ ...result, host_count: 0 }, { status: 201 });
}
