// GET /api/alerts — list all active alerts with hostname
import type { AlertItem } from "@bat/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";

export async function alertsListRoute(c: Context<AppEnv>) {
	const db = c.env.DB;

	const result = await db
		.prepare(
			`SELECT a.host_id, a.rule_id, a.severity, a.value, a.triggered_at, a.message, h.hostname
FROM alert_states a
JOIN hosts h ON a.host_id = h.host_id
WHERE h.is_active = 1
ORDER BY a.triggered_at DESC`,
		)
		.all<AlertItem>();

	return c.json(result.results);
}
