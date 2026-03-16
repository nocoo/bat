// GET /api/setup — return setup configuration (auth required)

import { auth } from "@/auth";

function getDashboardUrl(req: Request): string {
	const forwardedHost = req.headers.get("x-forwarded-host");
	const forwardedProto = req.headers.get("x-forwarded-proto") || "https";

	if (forwardedHost) {
		return `${forwardedProto}://${forwardedHost}`;
	}

	return new URL(req.url).origin;
}

export async function GET(req: Request) {
	const session = await auth();
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const workerUrl = process.env.BAT_API_URL || "";
	const writeKey = process.env.BAT_WRITE_KEY || "";
	const dashboardUrl = getDashboardUrl(req);

	return Response.json({
		worker_url: workerUrl,
		write_key: writeKey,
		dashboard_url: dashboardUrl,
	});
}
