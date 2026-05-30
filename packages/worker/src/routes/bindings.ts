// Binding CRUD + Map/Overview routes
// POST   /api/bindings              — create binding
// GET    /api/bindings              — list all bindings
// DELETE /api/bindings/:agentId/:assetId — delete binding
// GET    /api/assets/map            — full graph read model
// GET    /api/assets/overview       — lightweight counters

import type { Context } from "hono";
import type { AppEnv } from "../types.js";

export async function bindingsListRoute(c: Context<AppEnv>) {
	const items = await c.var.repos.bindings.list();
	return c.json(items);
}

export async function bindingsCreateRoute(c: Context<AppEnv>) {
	const raw = await c.req.text();
	if (raw.trim().length === 0) {
		return c.json({ error: "Request body required" }, 400);
	}

	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return c.json({ error: "Request body must be a JSON object" }, 400);
	}
	const obj = body as Record<string, unknown>;

	if (typeof obj.agent_id !== "string" || obj.agent_id.length === 0) {
		return c.json({ error: "agent_id must be a non-empty string" }, 400);
	}
	if (typeof obj.asset_id !== "string" || obj.asset_id.length === 0) {
		return c.json({ error: "asset_id must be a non-empty string" }, 400);
	}

	const [agentOk, assetOk] = await Promise.all([
		c.var.repos.bindings.agentExists(obj.agent_id),
		c.var.repos.bindings.assetExists(obj.asset_id),
	]);
	if (!agentOk) {
		return c.json({ error: `agent_id "${obj.agent_id}" does not exist` }, 400);
	}
	if (!assetOk) {
		return c.json({ error: `asset_id "${obj.asset_id}" does not exist` }, 400);
	}

	const result = await c.var.repos.bindings.create(obj.agent_id, obj.asset_id);
	return c.json({ agent_id: obj.agent_id, asset_id: obj.asset_id }, result.created ? 201 : 200);
}

export async function bindingsDeleteRoute(c: Context<AppEnv>) {
	const agentId = c.req.param("agentId") ?? "";
	const assetId = c.req.param("assetId") ?? "";

	const deleted = await c.var.repos.bindings.delete(agentId, assetId);
	if (!deleted) {
		return c.json({ error: "Binding not found" }, 404);
	}
	return c.body(null, 204);
}

export async function assetsMapRoute(c: Context<AppEnv>) {
	const data = await c.var.repos.bindings.getAssetMap();
	return c.json(data);
}

export async function assetsOverviewRoute(c: Context<AppEnv>) {
	const data = await c.var.repos.bindings.getOverview();
	return c.json(data);
}
