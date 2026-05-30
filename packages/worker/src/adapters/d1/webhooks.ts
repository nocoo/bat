// D1-backed WebhooksRepository. SQL lifted verbatim from
// `services/events.ts` (webhook config CRUD half) plus the FK-existence
// check that previously lived inline in `routes/webhooks.ts`.

import type { WebhookConfigRow } from "@bat/shared";
import { generateWebhookToken } from "../../domain/webhook-token.js";
import type { WebhooksRepository } from "../../repos/types.js";

export class D1WebhooksRepository implements WebhooksRepository {
	private readonly db: D1Database;

	constructor(db: D1Database) {
		this.db = db;
	}

	async list(): Promise<(WebhookConfigRow & { hostname: string })[]> {
		const result = await this.db
			.prepare(
				`SELECT w.*, h.hostname
FROM webhook_configs w
JOIN hosts h ON w.host_id = h.host_id
ORDER BY w.created_at DESC`,
			)
			.all<WebhookConfigRow & { hostname: string }>();
		return result.results;
	}

	async create(
		hostId: string,
		nowSeconds: number,
	): Promise<{ ok: true; row: WebhookConfigRow } | { ok: "host_not_found" } | { ok: "duplicate" }> {
		const host = await this.db
			.prepare("SELECT host_id FROM hosts WHERE host_id = ?")
			.bind(hostId)
			.first<{ host_id: string }>();
		if (!host) {
			return { ok: "host_not_found" };
		}

		const token = generateWebhookToken();
		try {
			const row = await this.db
				.prepare(
					`INSERT INTO webhook_configs (host_id, token, created_at, updated_at)
VALUES (?, ?, ?, ?)
RETURNING *`,
				)
				.bind(hostId, token, nowSeconds, nowSeconds)
				.first<WebhookConfigRow>();
			if (!row) {
				throw new Error("Failed to create webhook config");
			}
			return { ok: true, row };
		} catch (err) {
			if (err instanceof Error && err.message.includes("UNIQUE")) {
				return { ok: "duplicate" };
			}
			throw err;
		}
	}

	async delete(configId: number): Promise<boolean> {
		const result = await this.db
			.prepare("DELETE FROM webhook_configs WHERE id = ?")
			.bind(configId)
			.run();
		return (result.meta?.changes ?? 0) > 0;
	}

	async regenerateToken(configId: number, nowSeconds: number): Promise<string | null> {
		const token = generateWebhookToken();
		const result = await this.db
			.prepare(
				`UPDATE webhook_configs SET token = ?, updated_at = ? WHERE id = ?
RETURNING token`,
			)
			.bind(token, nowSeconds, configId)
			.first<{ token: string }>();
		return result?.token ?? null;
	}
}
