// D1-backed SettingsRepository. SQL lifted verbatim from the previous
// `routes/settings.ts` callsite and `services/aggregation.ts` consumer.

import { DEFAULT_RETENTION_DAYS, type RetentionDays, parseRetentionDays } from "@bat/shared";
import type { SettingsRepository } from "../../repos/types.js";

export class D1SettingsRepository implements SettingsRepository {
	private readonly db: D1Database;

	constructor(db: D1Database) {
		this.db = db;
	}

	async getRetentionDays(): Promise<RetentionDays> {
		try {
			const row = await this.db
				.prepare("SELECT value FROM settings WHERE key = ?")
				.bind("retention_days")
				.first<{ value: string }>();
			if (!row) {
				return DEFAULT_RETENTION_DAYS;
			}
			return parseRetentionDays(row.value) ?? DEFAULT_RETENTION_DAYS;
		} catch {
			return DEFAULT_RETENTION_DAYS;
		}
	}

	async setRetentionDays(value: RetentionDays): Promise<void> {
		await this.db
			.prepare(
				"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
			)
			.bind("retention_days", String(value))
			.run();
	}
}
