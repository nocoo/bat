// GET /api/hosts/[id]/metrics — Proxy to Worker with query params
import { auth } from "@/auth";
import { proxyToWorker } from "@/lib/proxy-logic";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const { id } = await params;
	const searchParams = request.nextUrl.searchParams;
	return proxyToWorker(`/api/hosts/${id}/metrics`, searchParams);
}
