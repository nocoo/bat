// API Key auth middleware with read/write scope separation
// Write routes: POST /api/ingest, POST /api/identity, webhook CRUD → BAT_WRITE_KEY
// Read routes: GET /api/hosts, GET /api/hosts/:id/metrics, GET /api/alerts → BAT_READ_KEY
// Public routes: GET /api/live → no auth required
// Access-authenticated routes: browser endpoint with valid Access JWT → no API key required

import type { Context, Next } from "hono";
import type { AppEnv } from "../types.js";
import { isLocalhost, isMachineEndpoint } from "./entry-control.js";

/** Routes that require no authentication */
const PUBLIC_ROUTES = ["/api/live"];

/** Routes that require write key (BAT_WRITE_KEY) — exact match */
const WRITE_ROUTES = ["/api/ingest", "/api/identity", "/api/tier2"];

/** Routes that require read key on machine endpoint (BAT_READ_KEY) */
const MACHINE_READ_ROUTES_PREFIX = "/api/monitoring";

function extractBearerToken(header: string | undefined): string | null {
	if (!header) {
		return null;
	}
	const parts = header.split(" ");
	if (parts.length !== 2 || parts[0] !== "Bearer") {
		return null;
	}
	return parts[1] ?? null;
}

/** Check if a request requires BAT_WRITE_KEY based on method + path */
function isWriteRequest(method: string, path: string): boolean {
	// Probe ingest routes
	if (WRITE_ROUTES.includes(path)) {
		return true;
	}

	// Webhook CRUD mutations require write key
	// POST /api/webhooks — create
	// DELETE /api/webhooks/:id — delete
	// POST /api/webhooks/:id/regenerate — regenerate token
	// (GET /api/webhooks remains read-only → read key)
	if (path === "/api/webhooks" && method === "POST") {
		return true;
	}
	if (path.startsWith("/api/webhooks/") && (method === "DELETE" || method === "POST")) {
		return true;
	}

	// Maintenance window mutations require write key
	// PUT /api/hosts/:id/maintenance — set/update
	// DELETE /api/hosts/:id/maintenance — remove
	// (GET /api/hosts/:id/maintenance remains read-only → read key)
	if (
		/^\/api\/hosts\/[^/]+\/maintenance$/.test(path) &&
		(method === "PUT" || method === "DELETE")
	) {
		return true;
	}

	// Tag mutations require write key
	// POST /api/tags — create
	// PUT /api/tags/:id — update
	// DELETE /api/tags/:id — delete
	if (path === "/api/tags" && method === "POST") {
		return true;
	}
	if (path.startsWith("/api/tags/") && (method === "PUT" || method === "DELETE")) {
		return true;
	}

	// Host tag mutations require write key
	// POST /api/hosts/:id/tags — add tag
	// PUT /api/hosts/:id/tags — replace all tags
	// DELETE /api/hosts/:id/tags/:tagId — remove tag
	if (
		/^\/api\/hosts\/[^/]+\/tags(\/[^/]+)?$/.test(path) &&
		["POST", "PUT", "DELETE"].includes(method)
	) {
		return true;
	}

	// Port allowlist mutations require write key
	// POST /api/hosts/:id/allowed-ports — add port
	// DELETE /api/hosts/:id/allowed-ports/:port — remove port
	if (
		/^\/api\/hosts\/[^/]+\/allowed-ports(\/[^/]+)?$/.test(path) &&
		(method === "POST" || method === "DELETE")
	) {
		return true;
	}

	return false;
}

/** Check if route is a machine-only read route requiring BAT_READ_KEY */
function isMachineReadRoute(path: string): boolean {
	return path.startsWith(MACHINE_READ_ROUTES_PREFIX);
}

export async function apiKeyAuth(c: Context<AppEnv>, next: Next) {
	const path = c.req.path;
	const host = c.req.header("host") || "";

	// Public routes — no auth
	if (PUBLIC_ROUTES.includes(path)) {
		return next();
	}

	// Webhook event ingest — uses its own token auth (validated in handler)
	if (path === "/api/events" && c.req.method === "POST") {
		return next();
	}

	// Check if request has Access JWT (browser endpoint with valid JWT)
	// If so, skip API key check for non-machine routes
	const hasAccessJwt = !!c.req.header("Cf-Access-Jwt-Assertion");
	const isBrowserEndpoint = !(isLocalhost(host) || isMachineEndpoint(host));

	// For browser endpoint with Access JWT, only require API key for machine-specific routes
	if (isBrowserEndpoint && hasAccessJwt && !isMachineReadRoute(path)) {
		// Access JWT already validated by accessAuth middleware
		return next();
	}

	// From here on, require API key authentication
	const authHeader = c.req.header("Authorization");
	const token = extractBearerToken(authHeader);

	if (!token) {
		return c.json({ error: "Missing or invalid Authorization header" }, 401);
	}

	if (isWriteRequest(c.req.method, path)) {
		// Write routes require BAT_WRITE_KEY
		if (token === c.env.BAT_WRITE_KEY) {
			return next();
		}
		// Check if they used the read key on a write route
		if (token === c.env.BAT_READ_KEY) {
			return c.json({ error: "Read key cannot be used on write routes" }, 403);
		}
		return c.json({ error: "Invalid API key" }, 403);
	}

	// Read routes require BAT_READ_KEY
	if (token === c.env.BAT_READ_KEY) {
		return next();
	}
	// Check if they used the write key on a read route
	if (token === c.env.BAT_WRITE_KEY) {
		return c.json({ error: "Write key cannot be used on read routes" }, 403);
	}
	return c.json({ error: "Invalid API key" }, 403);
}
