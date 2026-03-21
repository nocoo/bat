// DELETE /api/hosts/:id/tags/:tagId — remove tag from host
import { auth } from "@/auth";
import { proxyToWorkerWithBody } from "@/lib/proxy-logic";

type Params = { params: Promise<{ id: string; tagId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id, tagId } = await params;
	return proxyToWorkerWithBody(`/api/hosts/${id}/tags/${tagId}`, "DELETE", null, true);
}
