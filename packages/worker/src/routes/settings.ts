// Settings CRUD routes
// GET  /api/settings  — read current settings (read key)
// PUT  /api/settings  — update settings (write key)
import { DEFAULT_RETENTION_DAYS, type RetentionDays, parseRetentionDays } from "@bat/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";

/**
 * Read retention_days from the DB settings table.
 * Returns DEFAULT_RETENTION_DAYS on missing row, bad value, or DB error.
 * Exported for use in scheduled handler and tests.
 */
export async function getRetentionDays(db: D1Database): Promise<RetentionDays> {
	try {
		const row = await db
			.prepare("SELECT value FROM settings WHERE key = ?")
			.bind("retention_days")
			.first<{ value: string }>();
		if (!row) {
			return DEFAULT_RETENTION_DAYS;
		}
		return parseRetentionDays(row.value) ?? DEFAULT_RETENTION_DAYS;
	} catch {
		return DEFAULT_RETENTION_DAYS;
	}
}

/** GET /api/settings — returns current settings */
export async function settingsGetRoute(c: Context<AppEnv>) {
	const retentionDays = await getRetentionDays(c.env.DB);
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

	await c.env.DB.prepare(
		"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
	)
		.bind("retention_days", String(parsed))
		.run();

	return c.json({ retention_days: parsed });
}
