// D1-backed EventsRepository. SQL lifted verbatim from
// `services/events.ts` and the inline statements in
// `routes/events-{ingest,list}.ts`. Webhook config CRUD lives in
// `adapters/d1/webhooks.ts`; this module owns the event ingest path
// (token lookup, IP read, rate limit, insert) and the list read.

import type { EventRow, WebhookConfigRow } from "@bat/shared";
import type { EventsRepository } from "../../repos/types.js";

export class D1EventsRepository implements EventsRepository {
	private readonly db: D1Database;

	constructor(db: D1Database) {
		this.db = db;
	}

	async findActiveWebhookByToken(token: string): Promise<WebhookConfigRow | null> {
		return this.db
			.prepare("SELECT * FROM webhook_configs WHERE token = ? AND is_active = 1")
			.bind(token)
			.first<WebhookConfigRow>();
	}

	async getHostPublicIp(hostId: string): Promise<string | null> {
		const row = await this.db
			.prepare("SELECT public_ip FROM hosts WHERE host_id = ?")
			.bind(hostId)
			.first<{ public_ip: string | null }>();
		return row?.public_ip ?? null;
	}

	async checkRateLimit(configId: number, rateLimit: number, nowSeconds: number): Promise<boolean> {
		const currentMinute = Math.floor(nowSeconds / 60) * 60;

		// Atomic UPDATE ... RETURNING — sliding minute window.
		const result = await this.db
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

	async insertEvent(
		hostId: string,
		configId: number,
		title: string,
		body: string,
		tags: string[],
		sourceIp: string,
		nowSeconds: number,
	): Promise<void> {
		await this.db
			.prepare(
				`INSERT INTO events (host_id, webhook_config_id, title, body, tags, source_ip, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(hostId, configId, title, body, JSON.stringify(tags), sourceIp, nowSeconds)
			.run();
	}

	async count(hostId: string | undefined): Promise<number> {
		const stmt = hostId
			? this.db.prepare("SELECT COUNT(*) as count FROM events WHERE host_id = ?").bind(hostId)
			: this.db.prepare("SELECT COUNT(*) as count FROM events");
		const result = await stmt.first<{ count: number }>();
		return result?.count ?? 0;
	}

	async list(hostId: string | undefined, limit: number, offset: number): Promise<EventRow[]> {
		if (hostId) {
			const result = await this.db
				.prepare(
					`SELECT e.id, e.host_id, h.hostname, e.title, e.body, e.tags, e.source_ip, e.created_at
FROM events e
JOIN hosts h ON e.host_id = h.host_id
WHERE e.host_id = ?
ORDER BY e.created_at DESC
LIMIT ? OFFSET ?`,
				)
				.bind(hostId, limit, offset)
				.all<EventRow>();
			return result.results;
		}
		const result = await this.db
			.prepare(
				`SELECT e.id, e.host_id, h.hostname, e.title, e.body, e.tags, e.source_ip, e.created_at
FROM events e
JOIN hosts h ON e.host_id = h.host_id
ORDER BY e.created_at DESC
LIMIT ? OFFSET ?`,
			)
			.bind(limit, offset)
			.all<EventRow>();
		return result.results;
	}
}
