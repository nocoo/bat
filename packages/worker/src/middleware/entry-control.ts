// Entry control middleware: route requests based on hostname
// - localhost: bypass entry control, use API key auth (local dev / E2E tests)
// - bat-ingest.*: whitelist mode, only allow machine routes
// - bat.*: require Access JWT (handled by accessAuth)

import type { Context, Next } from "hono";
import { coordinates, isVersionedPath } from "../domain/connect.js";
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
	{ method: "GET", path: "/api/me" },
];

/**
 * CLI asset route prefixes — all HTTP methods allowed on machine endpoint.
 * Auth is delegated entirely to apiKeyAuth (CLI token scope enforcement).
 */
const CLI_MACHINE_PREFIXES = ["/api/agents", "/api/assets", "/api/bindings"];

function isCliMachineRoute(path: string): boolean {
	return CLI_MACHINE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function isAllowedMachineRoute(method: string, path: string): boolean {
	if (isVersionedPath(path)) return true; // Authenticated exclusively by connectBearer.
	// CLI asset routes: any method, prefix match (auth delegated to apiKeyAuth)
	if (isCliMachineRoute(path)) {
		return true;
	}
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
		/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) ||
		/^[a-z0-9-]+\.dev\.hexly\.ai(?::\d+)?$/.test(host)
	);
}

export function isMachineEndpoint(host: string): boolean {
	return /^bat-ingest(?:-[a-z0-9-]+)?\.worker\.hexly\.ai(?::\d+)?$/.test(host);
}

export async function entryControl(c: Context<AppEnv>, next: Next) {
	const host =
		c.env?.ENVIRONMENT === "production"
			? new URL(c.req.url).hostname
			: c.req.header("host") || new URL(c.req.url).hostname;
	const path = c.req.path;
	const method = c.req.method;
	if (
		c.env?.ENVIRONMENT === "production" &&
		host !== "bat.hexly.ai" &&
		host !== "bat-ingest.worker.hexly.ai"
	)
		return c.json({ error: "Unknown production hostname" }, 403);
	if (
		c.env?.ENVIRONMENT === "production" &&
		coordinates(method, path) &&
		c.env.CONNECT_COORDINATED !== true
	)
		return c.json({ error: "Configuration coordination required" }, 503);

	// localhost: skip entry control, continue with apiKeyAuth (local dev / E2E tests)
	if (isLocalhost(host)) {
		return next();
	}

	// bat-ingest.* endpoint: whitelist mode (method + path)
	if (isMachineEndpoint(host)) {
		if (!isAllowedMachineRoute(method === "HEAD" ? "GET" : method, path)) {
			return c.json({ error: "Route not allowed on machine endpoint" }, 403);
		}
		// Allowed routes continue to apiKeyAuth
		return next();
	}

	// bat.* endpoint: needs Access JWT (handled by accessAuth)
	return next();
}
