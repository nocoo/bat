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
	const idParam = c.req.param("id");

	const host = await resolveHostRecord(c.var.repos.hosts, idParam);
	if (!host) {
		return c.json({ error: "Host not found" }, 404);
	}

	const window = await c.var.repos.maintenance.getForHost(host.host_id);
	if (!window) {
		return c.json(null);
	}
	return c.json({
		start: window.start,
		end: window.end,
		reason: window.reason ?? "",
	});
}

/** PUT /api/hosts/:id/maintenance */
export async function maintenanceSetRoute(c: Context<AppEnv, "/api/hosts/:id/maintenance">) {
	const idParam = c.req.param("id");

	const host = await resolveHostRecord(c.var.repos.hosts, idParam);
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

	await c.var.repos.maintenance.setForHost(host.host_id, result.value, { kv: c.env.BAT_KV });

	return new Response(null, { status: 204 });
}

/** DELETE /api/hosts/:id/maintenance */
export async function maintenanceDeleteRoute(c: Context<AppEnv, "/api/hosts/:id/maintenance">) {
	const idParam = c.req.param("id");

	const host = await resolveHostRecord(c.var.repos.hosts, idParam);
	if (!host) {
		return c.json({ error: "Host not found" }, 404);
	}
	if (!host.is_active) {
		return c.json({ error: "Host is retired" }, 403);
	}

	await c.var.repos.maintenance.clearForHost(host.host_id, { kv: c.env.BAT_KV });

	return new Response(null, { status: 204 });
}
