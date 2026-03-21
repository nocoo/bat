// GET /api/hosts/:id/tags — tags for a host
// POST /api/hosts/:id/tags — add tag to host
// PUT /api/hosts/:id/tags — replace host's tags
import { auth } from "@/auth";
import { proxyToWorker, proxyToWorkerWithBody } from "@/lib/proxy-logic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id } = await params;
	return proxyToWorker(`/api/hosts/${id}/tags`);
}

export async function POST(request: Request, { params }: Params) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id } = await params;
	const body = await request.text();
	return proxyToWorkerWithBody(`/api/hosts/${id}/tags`, "POST", body, true);
}

export async function PUT(request: Request, { params }: Params) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id } = await params;
	const body = await request.text();
	return proxyToWorkerWithBody(`/api/hosts/${id}/tags`, "PUT", body, true);
}
