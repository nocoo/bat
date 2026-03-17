// GET /api/hosts/[id] — Proxy to Worker for host detail
import { auth } from "@/auth";
import { proxyToWorker } from "@/lib/proxy-logic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id } = await params;
	return proxyToWorker(`/api/hosts/${id}`);
}
