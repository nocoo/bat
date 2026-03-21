// Maintenance window CRUD — GET/PUT/DELETE /api/hosts/:id/maintenance
// Source of truth: docs/17-maintenance-window.md § API

import { hashHostId, isValidTimeHHMM } from "@bat/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";

/**
 * Resolve the route param to a real host_id.
 * Accepts both raw host_id and 8-char hex hid.
 */
async function resolveHostId(
	db: D1Database,
	id: string,
): Promise<{ host_id: string; is_active: number } | null> {
	const isHid = /^[0-9a-f]{8}$/.test(id);

	if (!isHid) {
		const row = await db
			.prepare("SELECT host_id, is_active FROM hosts WHERE host_id = ?")
			.bind(id)
			.first<{ host_id: string; is_active: number }>();
		return row ?? null;
	}

	const result = await db
		.prepare("SELECT host_id, is_active FROM hosts")
		.all<{ host_id: string; is_active: number }>();
	for (const row of result.results) {
		if (hashHostId(row.host_id) === id) return row;
	}
	return null;
}

/** GET /api/hosts/:id/maintenance */
export async function maintenanceGetRoute(
	c: Context<AppEnv, "/api/hosts/:id/maintenance">,
) {
	const db = c.env.DB;
	const idParam = c.req.param("id");

	const host = await resolveHostId(db, idParam);
	if (!host) {
		return c.json({ error: "Host not found" }, 404);
	}

	const row = await db
		.prepare(
			"SELECT maintenance_start, maintenance_end, maintenance_reason FROM hosts WHERE host_id = ?",
		)
		.bind(host.host_id)
		.first<{
			maintenance_start: string | null;
			maintenance_end: string | null;
			maintenance_reason: string | null;
		}>();

	if (!row?.maintenance_start || !row?.maintenance_end) {
		return c.json(null);
	}

	return c.json({
		start: row.maintenance_start,
		end: row.maintenance_end,
		reason: row.maintenance_reason ?? "",
	});
}

/** PUT /api/hosts/:id/maintenance */
export async function maintenanceSetRoute(
	c: Context<AppEnv, "/api/hosts/:id/maintenance">,
) {
	const db = c.env.DB;
	const idParam = c.req.param("id");

	const host = await resolveHostId(db, idParam);
	if (!host) {
		return c.json({ error: "Host not found" }, 404);
	}
	if (!host.is_active) {
		return c.json({ error: "Host is retired" }, 403);
	}

	let body: { start?: string; end?: string; reason?: string };
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	const { start, end, reason } = body;

	if (!start || !end) {
		return c.json({ error: "start and end are required" }, 400);
	}

	if (!isValidTimeHHMM(start)) {
		return c.json({ error: `Invalid start time: ${start}` }, 400);
	}
	if (!isValidTimeHHMM(end)) {
		return c.json({ error: `Invalid end time: ${end}` }, 400);
	}
	if (start === end) {
		return c.json({ error: "start and end must be different" }, 400);
	}

	if (reason !== undefined && typeof reason !== "string") {
		return c.json({ error: "reason must be a string" }, 400);
	}
	if (reason && reason.length > 200) {
		return c.json({ error: "reason must be 200 characters or fewer" }, 400);
	}

	await db
		.prepare(
			"UPDATE hosts SET maintenance_start = ?, maintenance_end = ?, maintenance_reason = ? WHERE host_id = ?",
		)
		.bind(start, end, reason ?? null, host.host_id)
		.run();

	return new Response(null, { status: 204 });
}

/** DELETE /api/hosts/:id/maintenance */
export async function maintenanceDeleteRoute(
	c: Context<AppEnv, "/api/hosts/:id/maintenance">,
) {
	const db = c.env.DB;
	const idParam = c.req.param("id");

	const host = await resolveHostId(db, idParam);
	if (!host) {
		return c.json({ error: "Host not found" }, 404);
	}
	if (!host.is_active) {
		return c.json({ error: "Host is retired" }, 403);
	}

	await db
		.prepare(
			"UPDATE hosts SET maintenance_start = NULL, maintenance_end = NULL, maintenance_reason = NULL WHERE host_id = ?",
		)
		.bind(host.host_id)
		.run();

	return new Response(null, { status: 204 });
}
