// GET /api/live — public liveness check (no auth required)
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

export async function GET() {
	const timestamp = new Date().toISOString();
	const uptime = Math.floor(process.uptime());

	return Response.json(
		{
			status: "ok" as const,
			version: APP_VERSION,
			component: "dashboard",
			timestamp,
			uptime,
		},
		{
			status: 200,
			headers: { "Cache-Control": "no-store" },
		},
	);
}
