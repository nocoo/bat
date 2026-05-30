// Webhook config CRUD contract tests. Lifted from
// `services/events-db.test.ts` (the webhook half) and rewritten against
// `D1WebhooksRepository`. SQL behaviour is unchanged — the SQL strings
// were copied verbatim from `services/events.ts`.

import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../../test-helpers/mock-d1";
import { D1WebhooksRepository } from "./webhooks";

const HOST_A = "host-a";
const HOST_B = "host-b";
const NOW = 1_730_000_000;

async function seedHosts(db: D1Database) {
	await db
		.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, 1)")
		.bind(HOST_A, "a.example.com", NOW)
		.run();
	await db
		.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, 1)")
		.bind(HOST_B, "b.example.com", NOW)
		.run();
}

describe("D1WebhooksRepository", () => {
	let db: D1Database;
	let repo: D1WebhooksRepository;
	beforeEach(async () => {
		db = createMockD1();
		await seedHosts(db);
		repo = new D1WebhooksRepository(db);
	});

	describe("create", () => {
		test("inserts a row and returns it", async () => {
			const result = await repo.create(HOST_A, NOW);
			expect(result.ok).toBe(true);
			if (result.ok !== true) {
				return;
			}
			expect(result.row.host_id).toBe(HOST_A);
			expect(result.row.token).toMatch(/^[0-9a-f]{32}$/);
			expect(result.row.is_active).toBe(1);
			expect(result.row.created_at).toBe(NOW);
		});

		test("returns host_not_found when FK target is missing", async () => {
			const result = await repo.create("ghost-host", NOW);
			expect(result.ok).toBe("host_not_found");
		});

		test("returns duplicate when a config already exists for the host", async () => {
			const first = await repo.create(HOST_A, NOW);
			expect(first.ok).toBe(true);
			const dup = await repo.create(HOST_A, NOW + 1);
			expect(dup.ok).toBe("duplicate");
		});
	});

	describe("list", () => {
		test("joins hostname and orders by created_at desc", async () => {
			const a = await repo.create(HOST_A, NOW);
			const b = await repo.create(HOST_B, NOW + 10);
			expect(a.ok).toBe(true);
			expect(b.ok).toBe(true);
			if (a.ok !== true || b.ok !== true) {
				return;
			}
			const list = await repo.list();
			expect(list.map((r) => r.id)).toEqual([b.row.id, a.row.id]);
			expect(list[0]?.hostname).toBe("b.example.com");
			expect(list[1]?.hostname).toBe("a.example.com");
		});

		test("returns empty array when there are no configs", async () => {
			expect(await repo.list()).toEqual([]);
		});
	});

	describe("delete", () => {
		test("returns true on hit, false on miss", async () => {
			const created = await repo.create(HOST_A, NOW);
			expect(created.ok).toBe(true);
			if (created.ok !== true) {
				return;
			}
			expect(await repo.delete(created.row.id)).toBe(true);
			expect(await repo.delete(created.row.id)).toBe(false);
			expect(await repo.delete(9999)).toBe(false);
		});
	});

	describe("regenerateToken", () => {
		test("mutates token and returns new value; null on missing id", async () => {
			const created = await repo.create(HOST_A, NOW);
			expect(created.ok).toBe(true);
			if (created.ok !== true) {
				return;
			}
			const fresh = await repo.regenerateToken(created.row.id, NOW + 5);
			expect(fresh).toMatch(/^[0-9a-f]{32}$/);
			expect(fresh).not.toBe(created.row.token);

			expect(await repo.regenerateToken(9999, NOW + 5)).toBeNull();
		});
	});
});
