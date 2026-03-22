// Webhook token generation, validation, and rate limiting
import type { WebhookConfigRow } from "@bat/shared";

/** Generate a 32-character hex token using Web Crypto API */
export function generateWebhookToken(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** Look up an active webhook config by token */
export async function findWebhookByToken(
	db: D1Database,
	token: string,
): Promise<WebhookConfigRow | null> {
	return db
		.prepare("SELECT * FROM webhook_configs WHERE token = ? AND is_active = 1")
		.bind(token)
		.first<WebhookConfigRow>();
}

/**
 * Sliding-window rate limiter using D1 atomic UPDATE ... RETURNING.
 * Returns true if the request is within the rate limit, false if exceeded.
 *
 * Uses minute-level windows: if window_start matches the current minute,
 * increment the counter; otherwise reset to a new window.
 */
export async function checkRateLimit(
	db: D1Database,
	configId: number,
	rateLimit: number,
	nowSeconds: number,
): Promise<boolean> {
	const currentMinute = Math.floor(nowSeconds / 60) * 60;

	// Attempt to increment within current window
	const result = await db
		.prepare(
			`UPDATE webhook_configs
SET window_count = CASE
  WHEN window_start = ? THEN window_count + 1
  ELSE 1
END,
window_start = ?,
updated_at = ?
WHERE id = ?
RETURNING window_count`,
		)
		.bind(currentMinute, currentMinute, nowSeconds, configId)
		.first<{ window_count: number }>();

	if (!result) {
		return false;
	}
	return result.window_count <= rateLimit;
}

/** Insert an event into the events table */
export async function insertEvent(
	db: D1Database,
	hostId: string,
	configId: number,
	title: string,
	body: string,
	tags: string[],
	sourceIp: string,
	nowSeconds: number,
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO events (host_id, webhook_config_id, title, body, tags, source_ip, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(hostId, configId, title, body, JSON.stringify(tags), sourceIp, nowSeconds)
		.run();
}

/** Create a webhook config for a host */
export async function createWebhookConfig(
	db: D1Database,
	hostId: string,
	nowSeconds: number,
): Promise<WebhookConfigRow> {
	const token = generateWebhookToken();
	const result = await db
		.prepare(
			`INSERT INTO webhook_configs (host_id, token, created_at, updated_at)
VALUES (?, ?, ?, ?)
RETURNING *`,
		)
		.bind(hostId, token, nowSeconds, nowSeconds)
		.first<WebhookConfigRow>();

	if (!result) {
		throw new Error("Failed to create webhook config");
	}
	return result;
}

/** Delete a webhook config by ID */
export async function deleteWebhookConfig(db: D1Database, configId: number): Promise<boolean> {
	const result = await db.prepare("DELETE FROM webhook_configs WHERE id = ?").bind(configId).run();
	return (result.meta?.changes ?? 0) > 0;
}

/** Regenerate the token for a webhook config */
export async function regenerateWebhookToken(
	db: D1Database,
	configId: number,
	nowSeconds: number,
): Promise<string | null> {
	const token = generateWebhookToken();
	const result = await db
		.prepare(
			`UPDATE webhook_configs SET token = ?, updated_at = ? WHERE id = ?
RETURNING token`,
		)
		.bind(token, nowSeconds, configId)
		.first<{ token: string }>();

	return result?.token ?? null;
}

/** List all webhook configs with hostname */
export async function listWebhookConfigs(
	db: D1Database,
): Promise<(WebhookConfigRow & { hostname: string })[]> {
	const result = await db
		.prepare(
			`SELECT w.*, h.hostname
FROM webhook_configs w
JOIN hosts h ON w.host_id = h.host_id
ORDER BY w.created_at DESC`,
		)
		.all<WebhookConfigRow & { hostname: string }>();

	return result.results;
}
