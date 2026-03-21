// GET /api/allowed-ports — all allowed ports grouped by host_id
import { auth } from "@/auth";
import { proxyToWorker } from "@/lib/proxy-logic";

export async function GET() {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	return proxyToWorker("/api/allowed-ports");
}
