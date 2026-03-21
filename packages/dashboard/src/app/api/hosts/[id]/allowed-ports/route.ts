// GET /api/hosts/:id/allowed-ports — list allowed ports for a host
// POST /api/hosts/:id/allowed-ports — add a port to the allowlist
import { auth } from "@/auth";
import { proxyToWorker, proxyToWorkerWithBody } from "@/lib/proxy-logic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id } = await params;
	return proxyToWorker(`/api/hosts/${id}/allowed-ports`);
}

export async function POST(request: Request, { params }: Params) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id } = await params;
	const body = await request.text();
	return proxyToWorkerWithBody(`/api/hosts/${id}/allowed-ports`, "POST", body, true);
}
