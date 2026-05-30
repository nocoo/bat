// Maintenance repository contract tests. SQL behaviour is unchanged
// from the prior route SELECT/UPDATE statements.

import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../../test-helpers/mock-d1";
import { D1MaintenanceRepository } from "./maintenance";

const HOST_A = "host-a";
const NOW = 1_730_000_000;

async function seedHost(db: D1Database) {
	await db
		.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, 1)")
		.bind(HOST_A, "a.example.com", NOW)
		.run();
}

describe("D1MaintenanceRepository", () => {
	let db: D1Database;
	let repo: D1MaintenanceRepository;
	beforeEach(async () => {
		db = createMockD1();
		await seedHost(db);
		repo = new D1MaintenanceRepository(db);
	});

	describe("getForHost", () => {
		test("returns null when no window is set", async () => {
			expect(await repo.getForHost(HOST_A)).toBeNull();
		});

		test("returns null when only one of start/end is set", async () => {
			await db
				.prepare("UPDATE hosts SET maintenance_start = ? WHERE host_id = ?")
				.bind("01:00", HOST_A)
				.run();
			expect(await repo.getForHost(HOST_A)).toBeNull();
		});

		test("returns the window with reason when set", async () => {
			await repo.setForHost(HOST_A, { start: "03:00", end: "05:00", reason: "Backup" });
			expect(await repo.getForHost(HOST_A)).toEqual({
				start: "03:00",
				end: "05:00",
				reason: "Backup",
			});
		});

		test("returns the window with null reason when reason is null", async () => {
			await repo.setForHost(HOST_A, { start: "03:00", end: "05:00", reason: null });
			expect(await repo.getForHost(HOST_A)).toEqual({
				start: "03:00",
				end: "05:00",
				reason: null,
			});
		});

		test("returns null for a non-existent host_id (UPDATE matches nothing)", async () => {
			expect(await repo.getForHost("ghost")).toBeNull();
		});
	});

	describe("setForHost", () => {
		test("upsert path inserts then updates", async () => {
			await repo.setForHost(HOST_A, { start: "01:00", end: "02:00", reason: "first" });
			await repo.setForHost(HOST_A, { start: "10:00", end: "11:00", reason: "second" });
			expect(await repo.getForHost(HOST_A)).toEqual({
				start: "10:00",
				end: "11:00",
				reason: "second",
			});
		});
	});

	describe("clearForHost", () => {
		test("nulls all three columns", async () => {
			await repo.setForHost(HOST_A, { start: "01:00", end: "02:00", reason: "x" });
			await repo.clearForHost(HOST_A);
			expect(await repo.getForHost(HOST_A)).toBeNull();
		});

		test("is a no-op on a host without a window", async () => {
			await expect(repo.clearForHost(HOST_A)).resolves.toBeUndefined();
		});
	});
});
