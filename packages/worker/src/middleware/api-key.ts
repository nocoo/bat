// API Key auth middleware with read/write scope separation + CLI token support
// Write routes: POST /api/ingest, POST /api/identity, webhook CRUD → BAT_WRITE_KEY
// Read routes: GET /api/hosts, GET /api/hosts/:id/metrics, GET /api/alerts → BAT_READ_KEY
// CLI token (assets scope): /api/agents/*, /api/assets/*, /api/bindings/*
// Public routes: GET /api/live → no auth required
// Access-authenticated routes: browser endpoint with valid Access JWT → no API key required

import type { Context, Next } from "hono";
import type { AppEnv } from "../types.js";
import { isLocalhost, isMachineEndpoint } from "./entry-control.js";

/** Routes that require no authentication */
const PUBLIC_ROUTES = ["/api/live", "/api/me"];

/** Routes that require write key (BAT_WRITE_KEY) — exact match */
const WRITE_ROUTES = ["/api/ingest", "/api/identity", "/api/tier2"];

/** Routes that require read key on machine endpoint (BAT_READ_KEY) */
const MACHINE_READ_ROUTES_PREFIX = "/api/monitoring";

/**
 * Routes accessible by CLI tokens with scope=assets.
 * Prefix matching: /api/agents, /api/assets, /api/bindings
 */
const CLI_ASSETS_SCOPE_PREFIXES = ["/api/agents", "/api/assets", "/api/bindings"];

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
export function isWriteRequest(method: string, path: string): boolean {
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

	// Settings mutations require write key
	// PUT /api/settings — update settings
	if (path === "/api/settings" && method === "PUT") {
		return true;
	}

	// Asset/agent/binding mutations require write-level auth
	// POST/PUT/PATCH/DELETE on /api/agents/*, /api/assets/*, /api/bindings/*
	if (isCliAssetsScopePath(path) && method !== "GET") {
		return true;
	}

	return false;
}

/** Check if route is a machine-only read route requiring BAT_READ_KEY */
export function isMachineReadRoute(path: string): boolean {
	return path.startsWith(MACHINE_READ_ROUTES_PREFIX);
}

/** Check if a path is within the CLI assets scope whitelist */
export function isCliAssetsScopePath(path: string): boolean {
	return CLI_ASSETS_SCOPE_PREFIXES.some(
		(prefix) => path === prefix || path.startsWith(`${prefix}/`),
	);
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

	// localhost / *.dev.hexly.ai: skip API key auth entirely (local dev / E2E tests)
	if (isLocalhost(host)) {
		return next();
	}

	// Check if request was authenticated by Access JWT (context flag set by accessAuth)
	// This flag is only set after successful JWT signature verification
	// Do NOT check the raw Cf-Access-Jwt-Assertion header - it could be forged
	const accessAuthenticated = c.get("accessAuthenticated") === true;
	const isBrowserEndpoint = !isMachineEndpoint(host);

	// For browser endpoint with verified Access JWT, skip API key for non-machine routes
	if (isBrowserEndpoint && accessAuthenticated && !isMachineReadRoute(path)) {
		return next();
	}

	// From here on, require API key authentication
	const authHeader = c.req.header("Authorization");
	const token = extractBearerToken(authHeader);

	if (!token) {
		return c.json({ error: "Missing or invalid Authorization header" }, 401);
	}

	// Check static keys first (fast path)
	if (isWriteRequest(c.req.method, path)) {
		// Write routes require BAT_WRITE_KEY
		if (token === c.env.BAT_WRITE_KEY) {
			return next();
		}
		// Check if they used the read key on a write route
		if (token === c.env.BAT_READ_KEY) {
			return c.json({ error: "Read key cannot be used on write routes" }, 403);
		}
		// CLI tokens with full scope can do write operations on asset routes
		// But NOT on probe ingest/settings/webhook routes — those are static key only
		if (isCliAssetsScopePath(path)) {
			// Defer to CLI token check below
		} else {
			return c.json({ error: "Invalid API key" }, 403);
		}
	} else {
		// Read routes: check static read key first
		if (token === c.env.BAT_READ_KEY) {
			return next();
		}
		// Check if they used the write key on a read route
		if (token === c.env.BAT_WRITE_KEY) {
			return c.json({ error: "Write key cannot be used on read routes" }, 403);
		}
		// Fall through to CLI token check for asset routes
		if (!isCliAssetsScopePath(path)) {
			return c.json({ error: "Invalid API key" }, 403);
		}
	}

	// CLI token validation path — only reached for asset scope routes
	// Hash the token and look it up in D1
	const { hashToken, findCliTokenByHash } = await import("../services/cli-tokens.js");
	const tokenHash = await hashToken(token);
	const cliToken = await findCliTokenByHash(c.env.DB, tokenHash);

	if (!cliToken) {
		return c.json({ error: "Invalid API key" }, 403);
	}

	// Scope enforcement: assets scope only allows /api/agents, /api/assets, /api/bindings
	if (!isCliAssetsScopePath(path)) {
		return c.json({ error: "Token scope insufficient for this route" }, 403);
	}

	return next();
}
