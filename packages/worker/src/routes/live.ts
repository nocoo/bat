// GET /api/live — public liveness check (no auth required)
import { BAT_VERSION, type LiveResponse } from "@bat/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";

const bootedAt = Date.now();

export async function liveRoute(c: Context<AppEnv>) {
	const timestamp = new Date().toISOString();
	const uptime = Math.round((Date.now() - bootedAt) / 1000);
	let database: { connected: boolean; error?: string } = { connected: false };

	try {
		await c.env.DB.prepare("SELECT 1 AS probe").first();
		database = { connected: true };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		database = { connected: false, error: msg.replace(/\bok\b/gi, "***") };
	}

	const healthy = database.connected;
	const response: LiveResponse = {
		status: healthy ? "ok" : "error",
		version: BAT_VERSION,
		component: "worker",
		timestamp,
		uptime,
		database,
	};

	return c.json(response, healthy ? 200 : 503, { "Cache-Control": "no-store" });
}
