// GET /api/events — Proxy to Worker
import { auth } from "@/auth";
import { proxyToWorker } from "@/lib/proxy-logic";

export async function GET(request: Request) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(request.url);
	return proxyToWorker("/api/events", url.searchParams);
}
