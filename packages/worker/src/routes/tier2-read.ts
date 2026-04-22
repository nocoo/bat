// GET /api/hosts/:id/tier2 — return latest Tier 2 snapshot for a host
import type { Context } from "hono";
import { resolveHostIdByHash } from "../lib/resolve-host.js";
import { getLatestTier2Snapshot } from "../services/tier2-metrics.js";
import type { AppEnv } from "../types.js";

export async function hostTier2Route(c: Context<AppEnv, "/api/hosts/:id/tier2">) {
	const idParam = c.req.param("id");
	const db = c.env.DB;

	const hostId = await resolveHostIdByHash(db, idParam);
	if (!hostId) {
		return c.json({ error: "Host not found" }, 404);
	}

	const snapshot = await getLatestTier2Snapshot(db, hostId);
	if (!snapshot) {
		return c.json({ error: "No tier2 data available" }, 404);
	}

	return c.json(snapshot);
}
