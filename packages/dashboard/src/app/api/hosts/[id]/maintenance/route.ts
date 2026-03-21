// GET/PUT/DELETE /api/hosts/[id]/maintenance — Proxy to Worker
import { auth } from "@/auth";
import { proxyToWorker, proxyToWorkerWithBody } from "@/lib/proxy-logic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id } = await params;
	return proxyToWorker(`/api/hosts/${id}/maintenance`);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id } = await params;
	const body = await request.text();
	return proxyToWorkerWithBody(`/api/hosts/${id}/maintenance`, "PUT", body, true);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id } = await params;
	return proxyToWorkerWithBody(`/api/hosts/${id}/maintenance`, "DELETE", null, true);
}
