// GET /api/alerts — list all active alerts with hostname
import type { AlertItem } from "@bat/shared";
import { hashHostId } from "@bat/shared";
import type { Context } from "hono";
import { tryReadCache, writeCache } from "../lib/dashboard-cache.js";
import type { AppEnv } from "../types.js";

const ALERTS_CACHE_TTL_SECONDS = 30;

export async function alertsListRoute(c: Context<AppEnv>) {
	c.header("Cache-Control", "no-store");
	const cacheEnabled = c.env.ENVIRONMENT === "production" && !c.var.connectToken;
	const cacheOpts = { route: "alerts", ttlSeconds: ALERTS_CACHE_TTL_SECONDS };
	if (cacheEnabled) {
		const cached = await tryReadCache(c.env.BAT_KV, c.req.raw, cacheOpts);
		if (cached) {
			const activeIds = new Set(
				(await c.var.repos.hosts.listActiveHostIds()).map((host) => host.host_id),
			);
			const items = await cached.json<AlertItem[]>();
			c.header("X-Bat-Cache", "hit");
			return c.json(items.filter((alert) => activeIds.has(alert.host_id)));
		}
	}

	const rows = await c.var.repos.alerts.listActiveJoinedHosts();

	const items: AlertItem[] = [];
	for (const row of rows) {
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
