// DELETE /api/webhooks/:id — delete webhook config
import { auth } from "@/auth";
import { proxyToWorkerWithBody } from "@/lib/proxy-logic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id } = await params;
	return proxyToWorkerWithBody(`/api/webhooks/${id}`, "DELETE");
}
