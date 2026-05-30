// Webhook config CRUD routes (all require BAT_READ_KEY via middleware)
// GET  /api/webhooks           — list all configs
// POST /api/webhooks           — create config for a host
// DELETE /api/webhooks/:id     — delete config
// POST /api/webhooks/:id/regenerate — regenerate token
import type { WebhookConfig, WebhookConfigRow } from "@bat/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";

/**
 * Pure DTO shaper: turn a raw `webhook_configs` row into the wire
 * `WebhookConfig` (coerces `is_active` 0/1 to boolean, drops internal
 * window_count/window_start). Exported for unit tests.
 */
export function toWebhookConfig(row: WebhookConfigRow): WebhookConfig {
	return {
		id: row.id,
		host_id: row.host_id,
		token: row.token,
		rate_limit: row.rate_limit,
		is_active: row.is_active === 1,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

/**
 * Parse the numeric webhook id from a route param. Returns `null` when the
 * param is missing, empty, or not a valid integer.
 */
export function parseWebhookId(raw: string | undefined): number | null {
	if (!raw) {
		return null;
	}
	const n = Number.parseInt(raw, 10);
	return Number.isNaN(n) ? null : n;
}

export type WebhookCreateBodyResult = { ok: true; host_id: string } | { ok: false; error: string };

/** Validate POST /api/webhooks body — requires a non-empty `host_id` string. */
export function validateWebhookCreateBody(body: unknown): WebhookCreateBodyResult {
	if (!body || typeof body !== "object") {
		return { ok: false, error: "Invalid payload" };
	}
	const payload = body as Record<string, unknown>;
	if (typeof payload.host_id !== "string" || payload.host_id.length === 0) {
		return { ok: false, error: "host_id is required" };
	}
	return { ok: true, host_id: payload.host_id };
}

export async function webhooksListRoute(c: Context<AppEnv>) {
	const rows = await c.var.repos.webhooks.list();
	const configs: (WebhookConfig & { hostname: string })[] = rows.map((r) => ({
		...toWebhookConfig(r),
		hostname: r.hostname,
	}));
	return c.json(configs);
}

export async function webhooksCreateRoute(c: Context<AppEnv>) {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	const result = validateWebhookCreateBody(body);
	if (!result.ok) {
		return c.json({ error: result.error }, 400);
	}

	const nowSeconds = Math.floor(Date.now() / 1000);
	const created = await c.var.repos.webhooks.create(result.host_id, nowSeconds);

	if (created.ok === "host_not_found") {
		return c.json({ error: "Host not found" }, 404);
	}
	if (created.ok === "duplicate") {
		return c.json({ error: "Webhook config already exists for this host" }, 409);
	}
	return c.json(toWebhookConfig(created.row), 201);
}

export async function webhooksDeleteRoute(c: Context<AppEnv>) {
	const id = parseWebhookId(c.req.param("id"));
	if (id === null) {
		return c.json({ error: "Invalid webhook ID" }, 400);
	}

	const deleted = await c.var.repos.webhooks.delete(id);
	if (!deleted) {
		return c.json({ error: "Webhook config not found" }, 404);
	}

	return c.body(null, 204);
}

export async function webhooksRegenerateRoute(c: Context<AppEnv>) {
	const id = parseWebhookId(c.req.param("id"));
	if (id === null) {
		return c.json({ error: "Invalid webhook ID" }, 400);
	}

	const nowSeconds = Math.floor(Date.now() / 1000);
	const newToken = await c.var.repos.webhooks.regenerateToken(id, nowSeconds);

	if (!newToken) {
		return c.json({ error: "Webhook config not found" }, 404);
	}

	return c.json({ token: newToken });
}
