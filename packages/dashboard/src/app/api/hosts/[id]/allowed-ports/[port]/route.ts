// DELETE /api/hosts/:id/allowed-ports/:port — remove port from allowlist
import { auth } from "@/auth";
import { proxyToWorkerWithBody } from "@/lib/proxy-logic";

type Params = { params: Promise<{ id: string; port: string }> };

export async function DELETE(_request: Request, { params }: Params) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id, port } = await params;
	return proxyToWorkerWithBody(`/api/hosts/${id}/allowed-ports/${port}`, "DELETE", null, true);
}
