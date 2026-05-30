// Webhook token validation, rate limiting, and event ingest helpers.
// Webhook *config* CRUD has moved to `adapters/d1/webhooks.ts` (C2).
// The remaining helpers below back POST /api/events; they migrate to
// `adapters/d1/events.ts` in C8.

import type { WebhookConfigRow } from "@bat/shared";

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
