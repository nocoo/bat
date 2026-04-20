// Entry control middleware: route requests based on hostname
// - localhost: bypass entry control, use API key auth (local dev / E2E tests)
// - bat-ingest.*: whitelist mode, only allow machine routes
// - bat.*: require Access JWT (handled by accessAuth)

import type { Context, Next } from "hono";
import type { AppEnv } from "../types.js";

// Machine endpoint whitelist: method + path
const MACHINE_ROUTES: Array<{ method: string; path: string; prefix?: boolean }> = [
	// Probe write routes
	{ method: "POST", path: "/api/ingest" },
	{ method: "POST", path: "/api/identity" },
	{ method: "POST", path: "/api/tier2" },
	// Webhook event receiver (POST only, has its own token validation)
	{ method: "POST", path: "/api/events" },
	// Machine read routes (Uptime Kuma)
	{ method: "GET", path: "/api/monitoring", prefix: true },
	// Public routes
	{ method: "GET", path: "/api/live" },
];

function isAllowedMachineRoute(method: string, path: string): boolean {
	return MACHINE_ROUTES.some((route) => {
		if (route.method !== method) {
			return false;
		}
		if (route.prefix) {
			return path === route.path || path.startsWith(`${route.path}/`);
		}
		return path === route.path;
	});
}

export function isLocalhost(host: string): boolean {
	return (
		host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.endsWith(".dev.hexly.ai") // Caddy local dev via *.dev.hexly.ai
	);
}

export function isMachineEndpoint(host: string): boolean {
	return host.includes("bat-ingest");
}

export async function entryControl(c: Context<AppEnv>, next: Next) {
	const host = c.req.header("host") || "";
	const path = c.req.path;
	const method = c.req.method;

	// localhost: skip entry control, continue with apiKeyAuth (local dev / E2E tests)
	if (isLocalhost(host)) {
		return next();
	}

	// bat-ingest.* endpoint: whitelist mode (method + path)
	if (isMachineEndpoint(host)) {
		if (!isAllowedMachineRoute(method, path)) {
			return c.json({ error: "Route not allowed on machine endpoint" }, 403);
		}
		// Allowed routes continue to apiKeyAuth
		return next();
	}

	// bat.* endpoint: needs Access JWT (handled by accessAuth)
	return next();
}
