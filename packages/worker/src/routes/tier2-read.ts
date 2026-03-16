// GET /api/hosts/:id/tier2 — return latest Tier 2 snapshot for a host
import { hashHostId } from "@bat/shared";
import type { Context } from "hono";
import { getLatestTier2Snapshot } from "../services/tier2-metrics.js";
import type { AppEnv } from "../types.js";

/**
 * Resolve the route param to a real host_id.
 * If `id` is an 8-char hex hid, scan active hosts to find the match.
 */
async function resolveHostId(db: D1Database, id: string): Promise<string | null> {
	const isHid = /^[0-9a-f]{8}$/.test(id);
	if (!isHid) return id;

	const result = await db
		.prepare("SELECT host_id FROM hosts WHERE is_active = 1")
		.all<{ host_id: string }>();
	for (const row of result.results) {
		if (hashHostId(row.host_id) === id) return row.host_id;
	}
	return null;
}

export async function hostTier2Route(c: Context<AppEnv, "/api/hosts/:id/tier2">) {
	const idParam = c.req.param("id");
	const db = c.env.DB;

	const hostId = await resolveHostId(db, idParam);
	if (!hostId) {
		return c.json({ error: "Host not found" }, 404);
	}

	const snapshot = await getLatestTier2Snapshot(db, hostId);
	if (!snapshot) {
		return c.json({ error: "No tier2 data available" }, 404);
	}

	return c.json(snapshot);
}
