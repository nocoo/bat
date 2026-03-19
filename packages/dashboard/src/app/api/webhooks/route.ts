// GET /api/webhooks — list webhook configs
// POST /api/webhooks — create webhook config
import { auth } from "@/auth";
import { proxyToWorker, proxyToWorkerWithBody } from "@/lib/proxy-logic";

export async function GET() {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	return proxyToWorker("/api/webhooks");
}

export async function POST(request: Request) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const body = await request.text();
	return proxyToWorkerWithBody("/api/webhooks", "POST", body, true);
}
