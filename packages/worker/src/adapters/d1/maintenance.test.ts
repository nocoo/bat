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

	describe("invalidates host meta projection on writes (Task #18 T5)", () => {
		function makeKv() {
			const store = new Map<string, { value: string; ttl?: number }>();
			const calls = { deletes: 0 };
			const kv = {
				get: async (key: string) => store.get(key)?.value ?? null,
				put: async (key: string, value: string, opts?: { expirationTtl?: number }) => {
					store.set(key, { value, ttl: opts?.expirationTtl });
				},
				delete: async (key: string) => {
					calls.deletes++;
					store.delete(key);
				},
				list: async () => ({ keys: [], list_complete: true, cursor: "" }),
				getWithMetadata: async () => ({ value: null, metadata: null }),
			} as unknown as KVNamespace;
			return { store, calls, kv };
		}

		test("setForHost deletes bat:host:meta:{id} when KV given", async () => {
			const { kv, store } = makeKv();
			store.set(`bat:host:meta:${HOST_A}`, { value: '{"is_active":1}' });
			await repo.setForHost(HOST_A, { start: "01:00", end: "02:00", reason: "x" }, { kv });
			expect(store.has(`bat:host:meta:${HOST_A}`)).toBe(false);
		});

		test("clearForHost deletes bat:host:meta:{id} when KV given", async () => {
			const { kv, store } = makeKv();
			store.set(`bat:host:meta:${HOST_A}`, { value: '{"is_active":1}' });
			await repo.clearForHost(HOST_A, { kv });
			expect(store.has(`bat:host:meta:${HOST_A}`)).toBe(false);
		});

		test("setForHost works without KV (no-op invalidate)", async () => {
			await expect(
				repo.setForHost(HOST_A, { start: "01:00", end: "02:00", reason: "x" }),
			).resolves.toBeUndefined();
		});

		test("clearForHost works without KV (no-op invalidate)", async () => {
			await expect(repo.clearForHost(HOST_A)).resolves.toBeUndefined();
		});
	});
});
