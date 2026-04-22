// Port allowlist CRUD routes
// GET    /api/allowed-ports              — all allowed ports grouped by host_id
// GET    /api/hosts/:id/allowed-ports    — allowed ports for a host
// POST   /api/hosts/:id/allowed-ports    — add a port to the allowlist
// DELETE /api/hosts/:id/allowed-ports/:port — remove a port
//
// Note: host-scoped routes accept raw host_id only (not 8-char hid).
// Dashboard always sends raw host_id for tag/port operations.

import { type AllowedPort, MAX_ALLOWED_PORTS_PER_HOST } from "@bat/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";

/** Validation result for POST /api/hosts/:id/allowed-ports body. */
export type AllowedPortBody =
	| { ok: true; port: number; reason: string }
	| { ok: false; error: string };

/**
 * Parse + validate the JSON body for adding a port to the allowlist.
 * Pure (no I/O) so it can be unit-tested directly.
 */
export function validateAllowedPortBody(body: unknown): AllowedPortBody {
	if (!body || typeof body !== "object") {
		return { ok: false, error: "Invalid payload" };
	}
	const payload = body as Record<string, unknown>;
	if (
		typeof payload.port !== "number" ||
		!Number.isInteger(payload.port) ||
		payload.port < 1 ||
		payload.port > 65535
	) {
		return { ok: false, error: "port must be an integer 1-65535" };
	}
	const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
	if (reason.length > 200) {
		return { ok: false, error: "reason must be 200 characters or fewer" };
	}
	return { ok: true, port: payload.port, reason };
}

/** Verify host exists. Returns true if found. */
async function hostExists(db: D1Database, hostId: string): Promise<boolean> {
	const row = await db
		.prepare("SELECT host_id FROM hosts WHERE host_id = ? LIMIT 1")
		.bind(hostId)
		.first<{ host_id: string }>();
	return row !== null;
}

// ---------------------------------------------------------------------------
// Bulk lookup
// ---------------------------------------------------------------------------

/** GET /api/allowed-ports — all ports grouped by host_id */
export async function allowedPortsAllRoute(c: Context<AppEnv>) {
	const db = c.env.DB;

	const result = await db
		.prepare("SELECT host_id, port FROM port_allowlist ORDER BY host_id, port")
		.all<{ host_id: string; port: number }>();

	return c.json(groupPortsByHost(result.results));
}

/**
 * Parse a port number from a route param. Returns `null` only when the
 * param is missing, empty, or not an integer. Out-of-range integers are
 * returned as-is so the DELETE handler can fall through to its usual
 * "not found in allowlist" 404 (preserving pre-refactor wire behaviour).
 */
export function parsePortParam(raw: string | undefined): number | null {
	if (!raw) return null;
	const n = Number.parseInt(raw, 10);
	if (Number.isNaN(n) || !Number.isInteger(n)) return null;
	return n;
}

/** Group `{ host_id, port }` rows into `{ [host_id]: number[] }`. */
export function groupPortsByHost(
	rows: { host_id: string; port: number }[],
): Record<string, number[]> {
	const map: Record<string, number[]> = {};
	for (const row of rows) {
		const list = map[row.host_id];
		if (list) {
			list.push(row.port);
		} else {
			map[row.host_id] = [row.port];
		}
	}
	return map;
}

// ---------------------------------------------------------------------------
// Per-host port allowlist
// ---------------------------------------------------------------------------

/** GET /api/hosts/:id/allowed-ports */
export async function hostAllowedPortsListRoute(
	c: Context<AppEnv, "/api/hosts/:id/allowed-ports">,
) {
	const db = c.env.DB;
	const hostId = c.req.param("id");

	// Verify host exists — return 404 instead of empty array for unknown hosts
	if (!(await hostExists(db, hostId))) {
		return c.json({ error: "Host not found" }, 404);
	}

	const result = await db
		.prepare(
			"SELECT port, reason, created_at FROM port_allowlist WHERE host_id = ? ORDER BY port ASC",
		)
		.bind(hostId)
		.all<AllowedPort>();

	return c.json(result.results);
}

/** POST /api/hosts/:id/allowed-ports */
export async function hostAllowedPortsAddRoute(c: Context<AppEnv, "/api/hosts/:id/allowed-ports">) {
	const db = c.env.DB;
	const hostId = c.req.param("id");

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	const validated = validateAllowedPortBody(body);
	if (!validated.ok) {
		return c.json({ error: validated.error }, 400);
	}
	const { port, reason } = validated;

	// Verify host exists
	if (!(await hostExists(db, hostId))) {
		return c.json({ error: "Host not found" }, 404);
	}

	// Idempotent: if this port is already allowed, return it directly
	const existing = await db
		.prepare("SELECT port, reason, created_at FROM port_allowlist WHERE host_id = ? AND port = ?")
		.bind(hostId, port)
		.first<AllowedPort>();
	if (existing) {
		return c.json(existing, 201);
	}

	// Check entry limit (only for genuinely new ports)
	const countRow = await db
		.prepare("SELECT COUNT(*) as cnt FROM port_allowlist WHERE host_id = ?")
		.bind(hostId)
		.first<{ cnt: number }>();
	if ((countRow?.cnt ?? 0) >= MAX_ALLOWED_PORTS_PER_HOST) {
		return c.json({ error: `Maximum ${MAX_ALLOWED_PORTS_PER_HOST} allowed ports per host` }, 422);
	}

	// INSERT OR IGNORE (idempotent if port already allowed)
	await db
		.prepare("INSERT OR IGNORE INTO port_allowlist (host_id, port, reason) VALUES (?, ?, ?)")
		.bind(hostId, port, reason)
		.run();

	// Return the inserted row
	const row = await db
		.prepare("SELECT port, reason, created_at FROM port_allowlist WHERE host_id = ? AND port = ?")
		.bind(hostId, port)
		.first<AllowedPort>();

	return c.json(row, 201);
}

/** DELETE /api/hosts/:id/allowed-ports/:port */
export async function hostAllowedPortsRemoveRoute(
	c: Context<AppEnv, "/api/hosts/:id/allowed-ports/:port">,
) {
	const db = c.env.DB;
	const hostId = c.req.param("id");
	const port = parsePortParam(c.req.param("port"));

	if (port === null) {
		return c.json({ error: "Invalid port number" }, 400);
	}

	const result = await db
		.prepare("DELETE FROM port_allowlist WHERE host_id = ? AND port = ?")
		.bind(hostId, port)
		.run();

	if (result.meta.changes === 0) {
		return c.json({ error: "Port not found in allowlist" }, 404);
	}

	return c.body(null, 204);
}
