// Maintenance window CRUD — GET/PUT/DELETE /api/hosts/:id/maintenance
// Source of truth: docs/17-maintenance-window.md § API

import { isValidTimeHHMM } from "@bat/shared";
import type { Context } from "hono";
import { resolveHostRecord } from "../lib/resolve-host.js";
import type { AppEnv } from "../types.js";

export interface MaintenanceBody {
	start: string;
	end: string;
	reason: string | null;
}

export type MaintenanceBodyResult =
	| { ok: true; value: MaintenanceBody }
	| { ok: false; error: string };

/**
 * Validate PUT /api/hosts/:id/maintenance body.
 * Returns `{ok:true, value}` on success or `{ok:false, error}` with the
 * exact 400 error message the route would have returned.
 */
export function validateMaintenanceBody(body: unknown): MaintenanceBodyResult {
	if (!body || typeof body !== "object") {
		return { ok: false, error: "start and end are required" };
	}
	const b = body as { start?: unknown; end?: unknown; reason?: unknown };
	const { start, end, reason } = b;

	if (typeof start !== "string" || typeof end !== "string" || !start || !end) {
		return { ok: false, error: "start and end are required" };
	}
	if (!isValidTimeHHMM(start)) {
		return { ok: false, error: `Invalid start time: ${start}` };
	}
	if (!isValidTimeHHMM(end)) {
		return { ok: false, error: `Invalid end time: ${end}` };
	}
	if (start === end) {
		return { ok: false, error: "start and end must be different" };
	}
	if (reason !== undefined && typeof reason !== "string") {
		return { ok: false, error: "reason must be a string" };
	}
	if (typeof reason === "string" && reason.length > 200) {
		return { ok: false, error: "reason must be 200 characters or fewer" };
	}
	return { ok: true, value: { start, end, reason: (reason as string | undefined) ?? null } };
}

/** GET /api/hosts/:id/maintenance */
export async function maintenanceGetRoute(c: Context<AppEnv, "/api/hosts/:id/maintenance">) {
	const db = c.env.DB;
	const idParam = c.req.param("id");

	const host = await resolveHostRecord(db, idParam);
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

	if (!(row?.maintenance_start && row?.maintenance_end)) {
		return c.json(null);
	}

	return c.json({
		start: row.maintenance_start,
		end: row.maintenance_end,
		reason: row.maintenance_reason ?? "",
	});
}

/** PUT /api/hosts/:id/maintenance */
export async function maintenanceSetRoute(c: Context<AppEnv, "/api/hosts/:id/maintenance">) {
	const db = c.env.DB;
	const idParam = c.req.param("id");

	const host = await resolveHostRecord(db, idParam);
	if (!host) {
		return c.json({ error: "Host not found" }, 404);
	}
	if (!host.is_active) {
		return c.json({ error: "Host is retired" }, 403);
	}

	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	const result = validateMaintenanceBody(body);
	if (!result.ok) {
		return c.json({ error: result.error }, 400);
	}
	const { start, end, reason } = result.value;

	await db
		.prepare(
			"UPDATE hosts SET maintenance_start = ?, maintenance_end = ?, maintenance_reason = ? WHERE host_id = ?",
		)
		.bind(start, end, reason, host.host_id)
		.run();

	return new Response(null, { status: 204 });
}

/** DELETE /api/hosts/:id/maintenance */
export async function maintenanceDeleteRoute(c: Context<AppEnv, "/api/hosts/:id/maintenance">) {
	const db = c.env.DB;
	const idParam = c.req.param("id");

	const host = await resolveHostRecord(db, idParam);
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
