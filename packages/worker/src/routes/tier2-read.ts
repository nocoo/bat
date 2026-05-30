// GET /api/hosts/:id/tier2 — return latest Tier 2 snapshot for a host
import type { Context } from "hono";
import { resolveHostIdByHash } from "../lib/resolve-host.js";
import type { AppEnv } from "../types.js";

export async function hostTier2Route(c: Context<AppEnv, "/api/hosts/:id/tier2">) {
	const idParam = c.req.param("id");

	// hid → host_id resolution still lives in lib/resolve-host.ts (C9 folds
	// it into HostsRepository).
	const hostId = await resolveHostIdByHash(c.env.DB, idParam);
	if (!hostId) {
		return c.json({ error: "Host not found" }, 404);
	}

	const snapshot = await c.var.repos.tier2.getLatestForHost(hostId);
	if (!snapshot) {
		return c.json({ error: "No tier2 data available" }, 404);
	}

	return c.json(snapshot);
}
