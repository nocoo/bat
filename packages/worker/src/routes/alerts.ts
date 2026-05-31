// GET /api/alerts — list all active alerts with hostname
import type { AlertItem } from "@bat/shared";
import { hashHostId, isInMaintenanceWindow, toUtcHHMM } from "@bat/shared";
import type { Context } from "hono";
import { tryReadCache, writeCache } from "../lib/dashboard-cache.js";
import type { AppEnv } from "../types.js";

const ALERTS_CACHE_TTL_SECONDS = 30;

export async function alertsListRoute(c: Context<AppEnv>) {
	const cacheEnabled = c.env.ENVIRONMENT === "production";
	const cacheOpts = { route: "alerts", ttlSeconds: ALERTS_CACHE_TTL_SECONDS };
	if (cacheEnabled) {
		const cached = await tryReadCache(c.env.BAT_KV, c.req.raw, cacheOpts);
		if (cached) {
			return cached;
		}
	}

	const rows = await c.var.repos.alerts.listActiveJoinedHosts();

	// Query-time filtering: exclude alerts for hosts currently in maintenance
	const nowHHMM = toUtcHHMM(Math.floor(Date.now() / 1000));
	const items: AlertItem[] = [];
	for (const row of rows) {
		if (
			row.maintenance_start &&
			row.maintenance_end &&
			isInMaintenanceWindow(nowHHMM, row.maintenance_start, row.maintenance_end)
		) {
			continue;
		}
		items.push({
			...row,
			hid: hashHostId(row.host_id),
			severity: row.severity as AlertItem["severity"],
		});
	}

	const response = c.json(items);
	if (cacheEnabled) {
		await writeCache(c.env.BAT_KV, c.req.raw, response, cacheOpts);
	}
	return response;
}
