// GET /api/alerts — list all active alerts with hostname
import type { AlertItem } from "@bat/shared";
import { hashHostId, isInMaintenanceWindow, toUtcHHMM } from "@bat/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";

interface AlertRow {
	host_id: string;
	hostname: string;
	rule_id: string;
	severity: string;
	value: number | null;
	triggered_at: number;
	message: string | null;
	maintenance_start: string | null;
	maintenance_end: string | null;
}

export async function alertsListRoute(c: Context<AppEnv>) {
	const db = c.env.DB;

	const result = await db
		.prepare(
			`SELECT a.host_id, a.rule_id, a.severity, a.value, a.triggered_at, a.message,
       h.hostname, h.maintenance_start, h.maintenance_end
FROM alert_states a
JOIN hosts h ON a.host_id = h.host_id
WHERE h.is_active = 1
ORDER BY a.triggered_at DESC`,
		)
		.all<AlertRow>();

	// Query-time filtering: exclude alerts for hosts currently in maintenance
	const nowHHMM = toUtcHHMM(Math.floor(Date.now() / 1000));
	const items: AlertItem[] = [];
	for (const row of result.results) {
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
