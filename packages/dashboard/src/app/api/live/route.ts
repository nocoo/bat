// GET /api/live — public liveness check (no auth required)
import { APP_VERSION } from "@/lib/version";

export async function GET() {
	return Response.json(
		{
			status: "ok",
			version: APP_VERSION,
			component: "dashboard",
		},
		{
			headers: { "Cache-Control": "no-store" },
		},
	);
}
