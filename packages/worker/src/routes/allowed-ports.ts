// Port allowlist CRUD routes
// GET    /api/allowed-ports              — all allowed ports grouped by host_id
// GET    /api/hosts/:id/allowed-ports    — allowed ports for a host
// POST   /api/hosts/:id/allowed-ports    — add a port to the allowlist
// DELETE /api/hosts/:id/allowed-ports/:port — remove a port
//
// Note: host-scoped routes accept raw host_id only (not 8-char hid).
// Dashboard always sends raw host_id for tag/port operations.

import { MAX_ALLOWED_PORTS_PER_HOST } from "@bat/shared";
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

// ---------------------------------------------------------------------------
// Bulk lookup
// ---------------------------------------------------------------------------

/** GET /api/allowed-ports — all ports grouped by host_id */
export async function allowedPortsAllRoute(c: Context<AppEnv>) {
	const grouped = await c.var.repos.ports.listAllByHost();
	return c.json(grouped);
}

/**
 * Parse a port number from a route param. Returns `null` only when the
 * param is missing, empty, or not an integer. Out-of-range integers are
 * returned as-is so the DELETE handler can fall through to its usual
 * "not found in allowlist" 404 (preserving pre-refactor wire behaviour).
 */
export function parsePortParam(raw: string | undefined): number | null {
	if (!raw) {
		return null;
	}
	const n = Number.parseInt(raw, 10);
	if (Number.isNaN(n) || !Number.isInteger(n)) {
		return null;
	}
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
	const hostId = c.req.param("id");
	const result = await c.var.repos.ports.listForHost(hostId);
	if (result.ok === "host_not_found") {
		return c.json({ error: "Host not found" }, 404);
	}
	return c.json(result.rows);
}

/** POST /api/hosts/:id/allowed-ports */
export async function hostAllowedPortsAddRoute(c: Context<AppEnv, "/api/hosts/:id/allowed-ports">) {
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

	const result = await c.var.repos.ports.addToHost(hostId, validated.port, validated.reason);
	if (result.ok === "host_not_found") {
		return c.json({ error: "Host not found" }, 404);
	}
	if (result.ok === "limit_exceeded") {
		return c.json({ error: `Maximum ${MAX_ALLOWED_PORTS_PER_HOST} allowed ports per host` }, 422);
	}
	return c.json(result.row, 201);
}

/** DELETE /api/hosts/:id/allowed-ports/:port */
export async function hostAllowedPortsRemoveRoute(
	c: Context<AppEnv, "/api/hosts/:id/allowed-ports/:port">,
) {
	const hostId = c.req.param("id");
	const port = parsePortParam(c.req.param("port"));

	if (port === null) {
		return c.json({ error: "Invalid port number" }, 400);
	}

	const removed = await c.var.repos.ports.removeFromHost(hostId, port);
	if (!removed) {
		return c.json({ error: "Port not found in allowlist" }, 404);
	}
	return c.body(null, 204);
}
