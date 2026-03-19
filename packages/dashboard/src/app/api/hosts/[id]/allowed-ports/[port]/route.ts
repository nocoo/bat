// DELETE /api/hosts/:id/allowed-ports/:port — Remove one port from allowlist
// D1 direct. Per-host port allowlist for public_port alert suppression.

import { auth } from "@/auth";
import { d1Query } from "@/lib/d1";

type Params = { params: Promise<{ id: string; port: string }> };

export async function DELETE(_request: Request, { params }: Params) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id: hostId, port: portStr } = await params;
	const port = Number(portStr);
	if (Number.isNaN(port) || !Number.isInteger(port)) {
		return Response.json({ error: "Invalid port number" }, { status: 400 });
	}

	const result = await d1Query("DELETE FROM port_allowlist WHERE host_id = ? AND port = ?", [
		hostId,
		port,
	]);

	if (result.meta.changes === 0) {
		return Response.json({ error: "Port not found in allowlist" }, { status: 404 });
	}

	return new Response(null, { status: 204 });
}
