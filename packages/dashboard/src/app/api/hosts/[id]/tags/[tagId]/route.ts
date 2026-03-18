// DELETE /api/hosts/:id/tags/:tagId — Remove one tag from host
// D1 direct. Spec: docs/11-host-tags.md

import { auth } from "@/auth";
import { d1Query } from "@/lib/d1";

type Params = { params: Promise<{ id: string; tagId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id: hostId, tagId } = await params;
	const tagIdNum = Number(tagId);
	if (Number.isNaN(tagIdNum)) {
		return Response.json({ error: "Invalid tag ID" }, { status: 400 });
	}

	const result = await d1Query("DELETE FROM host_tags WHERE host_id = ? AND tag_id = ?", [
		hostId,
		tagIdNum,
	]);

	if (result.meta.changes === 0) {
		return Response.json({ error: "Tag assignment not found" }, { status: 404 });
	}

	return new Response(null, { status: 204 });
}
