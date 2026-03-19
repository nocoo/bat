// POST /api/webhooks/:id/regenerate — regenerate webhook token
import { auth } from "@/auth";
import { proxyToWorkerWithBody } from "@/lib/proxy-logic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id } = await params;
	return proxyToWorkerWithBody(`/api/webhooks/${id}/regenerate`, "POST", null, true);
}
