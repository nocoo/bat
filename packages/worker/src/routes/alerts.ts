// GET /api/alerts — list all active alerts with hostname
import type { AlertItem } from "@bat/shared";
import { hashHostId, isInMaintenanceWindow, toUtcHHMM } from "@bat/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";

export async function alertsListRoute(c: Context<AppEnv>) {
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

	return c.json(items);
}
