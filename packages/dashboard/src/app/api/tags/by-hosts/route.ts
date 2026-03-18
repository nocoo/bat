// GET /api/tags/by-hosts — All host→tag mappings (for hosts page)
// Returns { [host_id]: HostTag[] }
// D1 direct. Spec: docs/11-host-tags.md

import { auth } from "@/auth";
import { d1Query } from "@/lib/d1";
import type { HostTag } from "@bat/shared";

interface HostTagRow {
	host_id: string;
	id: number;
	name: string;
	color: number;
}

export async function GET() {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const result = await d1Query<HostTagRow>(
		`SELECT ht.host_id, t.id, t.name, t.color
		 FROM host_tags ht JOIN tags t ON t.id = ht.tag_id
		 ORDER BY t.name ASC`,
	);

	// Group by host_id
	const map: Record<string, HostTag[]> = {};
	for (const row of result.results) {
		const list = map[row.host_id] ?? [];
		list.push({ id: row.id, name: row.name, color: row.color });
		map[row.host_id] = list;
	}

	return Response.json(map);
}
