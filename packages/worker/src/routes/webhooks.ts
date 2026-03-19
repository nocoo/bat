// Webhook config CRUD routes (all require BAT_READ_KEY via middleware)
// GET  /api/webhooks           — list all configs
// POST /api/webhooks           — create config for a host
// DELETE /api/webhooks/:id     — delete config
// POST /api/webhooks/:id/regenerate — regenerate token
import type { WebhookConfig } from "@bat/shared";
import type { Context } from "hono";
import {
	createWebhookConfig,
	deleteWebhookConfig,
	listWebhookConfigs,
	regenerateWebhookToken,
} from "../services/events.js";
import type { AppEnv } from "../types.js";

export async function webhooksListRoute(c: Context<AppEnv>) {
	const db = c.env.DB;
	const rows = await listWebhookConfigs(db);

	const configs: (WebhookConfig & { hostname: string })[] = rows.map((r) => ({
		id: r.id,
		host_id: r.host_id,
		hostname: r.hostname,
		token: r.token,
		rate_limit: r.rate_limit,
		is_active: r.is_active === 1,
		created_at: r.created_at,
		updated_at: r.updated_at,
	}));

	return c.json(configs);
}

export async function webhooksCreateRoute(c: Context<AppEnv>) {
	const db = c.env.DB;

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
	if (typeof payload.host_id !== "string" || payload.host_id.length === 0) {
		return c.json({ error: "host_id is required" }, 400);
	}

	// Verify host exists
	const host = await db
		.prepare("SELECT host_id FROM hosts WHERE host_id = ?")
		.bind(payload.host_id)
		.first<{ host_id: string }>();

	if (!host) {
		return c.json({ error: "Host not found" }, 404);
	}

	const nowSeconds = Math.floor(Date.now() / 1000);

	try {
		const row = await createWebhookConfig(db, payload.host_id, nowSeconds);
		const config: WebhookConfig = {
			id: row.id,
			host_id: row.host_id,
			token: row.token,
			rate_limit: row.rate_limit,
			is_active: row.is_active === 1,
			created_at: row.created_at,
			updated_at: row.updated_at,
		};
		return c.json(config, 201);
	} catch (err) {
		// UNIQUE constraint on host_id
		if (err instanceof Error && err.message.includes("UNIQUE")) {
			return c.json({ error: "Webhook config already exists for this host" }, 409);
		}
		throw err;
	}
}

export async function webhooksDeleteRoute(c: Context<AppEnv>) {
	const db = c.env.DB;
	const idParam = c.req.param("id");
	if (!idParam) {
		return c.json({ error: "Invalid webhook ID" }, 400);
	}
	const id = Number.parseInt(idParam, 10);

	if (Number.isNaN(id)) {
		return c.json({ error: "Invalid webhook ID" }, 400);
	}

	const deleted = await deleteWebhookConfig(db, id);
	if (!deleted) {
		return c.json({ error: "Webhook config not found" }, 404);
	}

	return c.body(null, 204);
}

export async function webhooksRegenerateRoute(c: Context<AppEnv>) {
	const db = c.env.DB;
	const idParam = c.req.param("id");
	if (!idParam) {
		return c.json({ error: "Invalid webhook ID" }, 400);
	}
	const id = Number.parseInt(idParam, 10);

	if (Number.isNaN(id)) {
		return c.json({ error: "Invalid webhook ID" }, 400);
	}

	const nowSeconds = Math.floor(Date.now() / 1000);
	const newToken = await regenerateWebhookToken(db, id, nowSeconds);

	if (!newToken) {
		return c.json({ error: "Webhook config not found" }, 404);
	}

	return c.json({ token: newToken });
}
