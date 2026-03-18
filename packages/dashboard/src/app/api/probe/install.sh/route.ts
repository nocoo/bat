// GET /api/probe/install.sh — serve probe install script
// No auth required — public download

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { NextRequest } from "next/server";

const SCRIPT_PATH =
	process.env.PROBE_SCRIPT_PATH || join(process.cwd(), "probe-assets", "install.sh");

function getDashboardUrl(req: NextRequest): string {
	const forwardedHost = req.headers.get("x-forwarded-host");
	const forwardedProto = req.headers.get("x-forwarded-proto") || "https";

	if (forwardedHost) {
		return `${forwardedProto}://${forwardedHost}`;
	}

	return req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
	try {
		let script = await readFile(SCRIPT_PATH, "utf-8");

		const dashboardUrl = getDashboardUrl(req);
		// Only replace the assignment line — avoid clobbering the validation check
		script = script.replace('DASHBOARD_URL="__DASHBOARD_URL__"', `DASHBOARD_URL="${dashboardUrl}"`);

		return new Response(script, {
			headers: {
				"Content-Type": "text/plain; charset=utf-8",
				"Cache-Control": "no-store",
			},
		});
	} catch {
		return Response.json({ error: "Install script not available" }, { status: 404 });
	}
}
