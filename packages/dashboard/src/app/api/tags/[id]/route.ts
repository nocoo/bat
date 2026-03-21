// PUT /api/tags/:id — update tag
// DELETE /api/tags/:id — delete tag
import { auth } from "@/auth";
import { proxyToWorkerWithBody } from "@/lib/proxy-logic";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id } = await params;
	const body = await request.text();
	return proxyToWorkerWithBody(`/api/tags/${id}`, "PUT", body, true);
}

export async function DELETE(_request: Request, { params }: Params) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id } = await params;
	return proxyToWorkerWithBody(`/api/tags/${id}`, "DELETE", null, true);
}
