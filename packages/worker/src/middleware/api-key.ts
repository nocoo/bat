// API Key auth middleware with read/write scope separation
// Write routes: POST /api/ingest, POST /api/identity → BAT_WRITE_KEY
// Read routes: GET /api/hosts, GET /api/hosts/:id/metrics, GET /api/alerts → BAT_READ_KEY
// Public routes: GET /api/health → no auth required

import type { Context, Next } from "hono";
import type { AppEnv } from "../types.js";

/** Routes that require no authentication */
const PUBLIC_ROUTES = ["/api/health"];

/** Routes that require write key (BAT_WRITE_KEY) */
const WRITE_ROUTES = ["/api/ingest", "/api/identity"];

function extractBearerToken(header: string | undefined): string | null {
	if (!header) return null;
	const parts = header.split(" ");
	if (parts.length !== 2 || parts[0] !== "Bearer") return null;
	return parts[1];
}

export async function apiKeyAuth(c: Context<AppEnv>, next: Next) {
	const path = c.req.path;

	// Public routes — no auth
	if (PUBLIC_ROUTES.includes(path)) {
		return next();
	}

	const authHeader = c.req.header("Authorization");
	const token = extractBearerToken(authHeader);

	if (!token) {
		return c.json({ error: "Missing or invalid Authorization header" }, 401);
	}

	const isWriteRoute = WRITE_ROUTES.includes(path);

	if (isWriteRoute) {
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
