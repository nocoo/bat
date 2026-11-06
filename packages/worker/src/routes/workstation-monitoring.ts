// Deployment-wide workstation reads for the external monitoring key
// (BAT_READ_KEY, `/api/monitoring/*`). Uptime Kuma already reads every host
// through this lane, so workstation reads are unfiltered here; Connect reads
// stay per-key and filter connectivity by server grants instead.

import type { Context } from "hono";
import { parseHistoryQuery } from "../domain/workstation-history.js";
import type { AppEnv } from "../types.js";

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export async function monitoringWorkstationsRoute(c: Context<AppEnv>) {
	return c.json(await c.var.repos.workstations.list());
}

export async function monitoringWorkstationRoute(
	c: Context<AppEnv, "/api/monitoring/workstations/:id">,
) {
	const record = await c.var.repos.workstations.get(c.req.param("id"));
	if (!record) {
		return c.json({ error: "Workstation not found" }, 404);
	}
	return c.json(record);
}

async function history(c: Context<AppEnv>, id: string) {
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

export async function monitoringWorkstationMetricsRoute(
	c: Context<AppEnv, "/api/monitoring/workstations/:id/metrics">,
) {
	const id = c.req.param("id");
	const resolved = await history(c, id);
	if ("error" in resolved) return resolved.error;
	const { from, to, limit, offset } = resolved.query;
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

export async function monitoringWorkstationConnectivityRoute(
	c: Context<AppEnv, "/api/monitoring/workstations/:id/connectivity">,
) {
	const id = c.req.param("id");
	const resolved = await history(c, id);
	if ("error" in resolved) return resolved.error;
	const { from, to, limit } = resolved.query;
	return c.json({
		targets: await c.var.repos.workstations.connectivity(id, from, to, limit),
		limit,
	});
}
