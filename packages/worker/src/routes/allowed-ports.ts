// Port allowlist CRUD routes
// GET    /api/allowed-ports              — all allowed ports grouped by host_id
// GET    /api/hosts/:id/allowed-ports    — allowed ports for a host
// POST   /api/hosts/:id/allowed-ports    — add a port to the allowlist
// DELETE /api/hosts/:id/allowed-ports/:port — remove a port

import { type AllowedPort, MAX_ALLOWED_PORTS_PER_HOST } from "@bat/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";

// ---------------------------------------------------------------------------
// Bulk lookup
// ---------------------------------------------------------------------------

/** GET /api/allowed-ports — all ports grouped by host_id */
export async function allowedPortsAllRoute(c: Context<AppEnv>) {
	const db = c.env.DB;

	const result = await db
		.prepare("SELECT host_id, port FROM port_allowlist ORDER BY host_id, port")
		.all<{ host_id: string; port: number }>();

	// Group into { [host_id]: number[] }
	const map: Record<string, number[]> = {};
	for (const row of result.results) {
		const list = map[row.host_id];
		if (list) {
			list.push(row.port);
		} else {
			map[row.host_id] = [row.port];
		}
	}

	return c.json(map);
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

	if (!body || typeof body !== "object") {
		return c.json({ error: "Invalid payload" }, 400);
	}

	const payload = body as Record<string, unknown>;

	// Validate port
	if (
		typeof payload.port !== "number" ||
		!Number.isInteger(payload.port) ||
		payload.port < 1 ||
		payload.port > 65535
	) {
		return c.json({ error: "port must be an integer 1-65535" }, 400);
	}

	// Validate reason
	const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
	if (reason.length > 200) {
		return c.json({ error: "reason must be 200 characters or fewer" }, 400);
	}

	// Idempotent: if this port is already allowed, return it directly
	const existing = await db
		.prepare("SELECT port, reason, created_at FROM port_allowlist WHERE host_id = ? AND port = ?")
		.bind(hostId, payload.port)
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
		.bind(hostId, payload.port, reason)
		.run();

	// Return the inserted row
	const row = await db
		.prepare("SELECT port, reason, created_at FROM port_allowlist WHERE host_id = ? AND port = ?")
		.bind(hostId, payload.port)
		.first<AllowedPort>();

	return c.json(row, 201);
}

/** DELETE /api/hosts/:id/allowed-ports/:port */
export async function hostAllowedPortsRemoveRoute(
	c: Context<AppEnv, "/api/hosts/:id/allowed-ports/:port">,
) {
	const db = c.env.DB;
	const hostId = c.req.param("id");
	const portStr = c.req.param("port");
	const port = Number.parseInt(portStr, 10);

	if (Number.isNaN(port) || !Number.isInteger(port)) {
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
