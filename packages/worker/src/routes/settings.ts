// Settings CRUD routes
// GET  /api/settings  — read current settings (read key)
// PUT  /api/settings  — update settings (write key)
import { parseRetentionDays } from "@bat/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";

/** GET /api/settings — returns current settings */
export async function settingsGetRoute(c: Context<AppEnv>) {
	const retentionDays = await c.var.repos.settings.getRetentionDays();
	return c.json({ retention_days: retentionDays });
}

/** PUT /api/settings — update settings */
export async function settingsPutRoute(c: Context<AppEnv>) {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	if (!body || typeof body !== "object") {
		return c.json({ error: "Invalid payload" }, 400);
	}

	const payload = body as Record<string, unknown>;
	const parsed = parseRetentionDays(payload.retention_days);
	if (parsed === null) {
		return c.json({ error: "retention_days must be 1, 7, or 30" }, 400);
	}

	await c.var.repos.settings.setRetentionDays(parsed);

	return c.json({ retention_days: parsed });
}
