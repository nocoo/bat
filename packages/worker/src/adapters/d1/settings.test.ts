// Settings repository contract tests. Lifted from
// `routes/settings.test.ts` (the `getRetentionDays` helper section) and
// rewritten against `D1SettingsRepository`. SQL behaviour is unchanged.

import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../../test-helpers/mock-d1";
import { D1SettingsRepository } from "./settings";

describe("D1SettingsRepository", () => {
	let db: D1Database;
	let repo: D1SettingsRepository;
	beforeEach(() => {
		db = createMockD1();
		repo = new D1SettingsRepository(db);
	});

	describe("getRetentionDays", () => {
		test("returns 7 from seeded migration", async () => {
			expect(await repo.getRetentionDays()).toBe(7);
		});

		test("returns updated value after setRetentionDays", async () => {
			await repo.setRetentionDays(30);
			expect(await repo.getRetentionDays()).toBe(30);
		});

		test("returns DEFAULT (7) for bad stored value", async () => {
			await db.prepare("UPDATE settings SET value = 'garbage' WHERE key = 'retention_days'").run();
			expect(await repo.getRetentionDays()).toBe(7);
		});

		test("returns DEFAULT (7) for missing row", async () => {
			await db.prepare("DELETE FROM settings WHERE key = 'retention_days'").run();
			expect(await repo.getRetentionDays()).toBe(7);
		});
	});

	describe("setRetentionDays", () => {
		test("upserts value (insert path)", async () => {
			await db.prepare("DELETE FROM settings WHERE key = 'retention_days'").run();
			await repo.setRetentionDays(30);
			expect(await repo.getRetentionDays()).toBe(30);
		});

		test("upserts value (update path)", async () => {
			await repo.setRetentionDays(30);
			await repo.setRetentionDays(1);
			expect(await repo.getRetentionDays()).toBe(1);
		});
	});
});
