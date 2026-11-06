// Browser workstation reads and revocation. All routes require a verified
// Access session through the normal chain; DELETE additionally requires the
// same-origin management confirmation and owner or global-manager authority.
// These routes are never registered on the machine endpoint.

import type { Context } from "hono";
import { configuredManager } from "../domain/connect.js";
import { parseHistoryQuery } from "../domain/workstation-history.js";
import type { AppEnv } from "../types.js";

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export async function workstationsListRoute(c: Context<AppEnv>) {
	return c.json(await c.var.repos.workstations.list());
}

export async function workstationDetailRoute(c: Context<AppEnv, "/api/workstations/:id">) {
	const record = await c.var.repos.workstations.get(c.req.param("id"));
	if (!record) {
		return c.json({ error: "Workstation not found" }, 404);
	}
	return c.json(record);
}

async function historyQuery(c: Context<AppEnv>, id: string) {
	const query = parseHistoryQuery(c.req.query(), nowSeconds());
	if (!query) {
		return {
			error: c.json(
				{
					error:
						"from/to must be Unix seconds within a 30 day window, limit 1-100, offset a non-negative integer",
				},
				400,
			),
		} as const;
	}
	const record = await c.var.repos.workstations.get(id);
	if (!record) {
		return { error: c.json({ error: "Workstation not found" }, 404) } as const;
	}
	return { query } as const;
}

export async function workstationMetricsRoute(c: Context<AppEnv, "/api/workstations/:id/metrics">) {
	const id = c.req.param("id");
	const history = await historyQuery(c, id);
	if ("error" in history) {
		return history.error;
	}
	const { from, to, limit, offset } = history.query;
	const data = await c.var.repos.workstations.metrics(id, from, to, limit, offset);
	return c.json({
		data,
		page: {
			limit,
			offset,
			next_offset: data.length === limit ? offset + data.length : null,
		},
	});
}

export async function workstationConnectivityRoute(
	c: Context<AppEnv, "/api/workstations/:id/connectivity">,
) {
	const id = c.req.param("id");
	const history = await historyQuery(c, id);
	if ("error" in history) {
		return history.error;
	}
	const { from, to, limit } = history.query;
	const targets = await c.var.repos.workstations.connectivity(id, from, to, limit);
	return c.json({ targets, limit });
}

export async function workstationDeleteRoute(c: Context<AppEnv, "/api/workstations/:id">) {
	if (
		c.get("accessAuthenticated") !== true ||
		c.req.header("Origin") !== new URL(c.req.url).origin ||
		c.req.header("X-Bat-Management") !== "1"
	) {
		return c.json({ error: "A same-origin browser confirmation is required" }, 403);
	}
	const principal = c.var.accessPrincipal;
	if (!principal) {
		return c.json({ error: "A browser Access session is required" }, 403);
	}
	const row = await c.var.repos.workstations.getById(c.req.param("id"));
	if (!row) {
		return c.json({ error: "Workstation not found" }, 404);
	}
	if (row.owner !== principal && !configuredManager(c.env.CONNECT_MANAGERS, principal)) {
		return c.json({ error: "You cannot revoke this workstation" }, 403);
	}
	await c.var.repos.workstations.delete(row.id, row.installation_id);
	return c.json({ ok: true });
}
