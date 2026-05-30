// Contract tests for D1EventsRepository. Covers webhook token lookup,
// rate limiting, event insert, host public-IP read, and the count/list
// pagination used by `routes/events-{ingest,list}.ts`. The behaviors
// were lifted verbatim from the now-deleted `services/events.ts`.

import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../../test-helpers/mock-d1";
import { D1EventsRepository } from "./events";
import { D1WebhooksRepository } from "./webhooks";

const HOST_A = "host-a";
const HOST_B = "host-b";
const NOW = 1_730_000_000;

async function seedHosts(db: D1Database) {
	await db
		.prepare(
			"INSERT INTO hosts (host_id, hostname, last_seen, is_active, public_ip) VALUES (?, ?, ?, 1, ?)",
		)
		.bind(HOST_A, "a.example.com", NOW, "1.2.3.4")
		.run();
	await db
		.prepare(
			"INSERT INTO hosts (host_id, hostname, last_seen, is_active, public_ip) VALUES (?, ?, ?, 1, ?)",
		)
		.bind(HOST_B, "b.example.com", NOW, null)
		.run();
}

async function createConfig(db: D1Database, hostId: string, now: number) {
	const result = await new D1WebhooksRepository(db).create(hostId, now);
	if (result.ok !== true) {
		throw new Error(`createConfig failed: ${result.ok}`);
	}
	return result.row;
}

describe("D1EventsRepository", () => {
	let db: D1Database;
	let repo: D1EventsRepository;
	beforeEach(async () => {
		db = createMockD1();
		repo = new D1EventsRepository(db);
		await seedHosts(db);
	});

	describe("findActiveWebhookByToken", () => {
		test("returns the active config, null on miss or inactive", async () => {
			const row = await createConfig(db, HOST_A, NOW);
			const hit = await repo.findActiveWebhookByToken(row.token);
			expect(hit?.id).toBe(row.id);

			expect(await repo.findActiveWebhookByToken("does-not-exist")).toBeNull();

			await db.prepare("UPDATE webhook_configs SET is_active = 0 WHERE id = ?").bind(row.id).run();
			expect(await repo.findActiveWebhookByToken(row.token)).toBeNull();
		});
	});

	describe("getHostPublicIp", () => {
		test("returns the registered IP", async () => {
			expect(await repo.getHostPublicIp(HOST_A)).toBe("1.2.3.4");
		});
		test("returns null when host has no public_ip", async () => {
			expect(await repo.getHostPublicIp(HOST_B)).toBeNull();
		});
		test("returns null when host does not exist", async () => {
			expect(await repo.getHostPublicIp("missing")).toBeNull();
		});
	});

	describe("insertEvent", () => {
		test("persists a row with serialized tags", async () => {
			const row = await createConfig(db, HOST_A, NOW);
			await repo.insertEvent(HOST_A, row.id, "hello", '{"k":1}', ["a", "b"], "1.2.3.4", NOW);
			const ev = await db
				.prepare("SELECT host_id, title, body, tags, source_ip, created_at FROM events")
				.first<{
					host_id: string;
					title: string;
					body: string;
					tags: string;
					source_ip: string;
					created_at: number;
				}>();
			expect(ev?.host_id).toBe(HOST_A);
			expect(ev?.title).toBe("hello");
			expect(ev?.tags).toBe('["a","b"]');
			expect(ev?.source_ip).toBe("1.2.3.4");
			expect(ev?.created_at).toBe(NOW);
		});
	});

	describe("checkRateLimit", () => {
		test("first request opens a window and returns true", async () => {
			const row = await createConfig(db, HOST_A, NOW);
			expect(await repo.checkRateLimit(row.id, 3, NOW)).toBe(true);
		});

		test("returns true while count <= limit, false once exceeded", async () => {
			const row = await createConfig(db, HOST_A, NOW);
			expect(await repo.checkRateLimit(row.id, 2, NOW)).toBe(true);
			expect(await repo.checkRateLimit(row.id, 2, NOW + 1)).toBe(true);
			expect(await repo.checkRateLimit(row.id, 2, NOW + 2)).toBe(false);
		});

		test("resets counter when a new minute window starts", async () => {
			const row = await createConfig(db, HOST_A, NOW);
			expect(await repo.checkRateLimit(row.id, 1, NOW)).toBe(true);
			expect(await repo.checkRateLimit(row.id, 1, NOW + 30)).toBe(false);
			expect(await repo.checkRateLimit(row.id, 1, NOW + 60)).toBe(true);
		});

		test("returns false when config id is missing", async () => {
			expect(await repo.checkRateLimit(9999, 10, NOW)).toBe(false);
		});
	});

	describe("count + list", () => {
		test("count() with no host_id returns total across hosts", async () => {
			const cfgA = await createConfig(db, HOST_A, NOW);
			const cfgB = await createConfig(db, HOST_B, NOW);
			await repo.insertEvent(HOST_A, cfgA.id, "t1", "{}", [], "1.2.3.4", NOW);
			await repo.insertEvent(HOST_A, cfgA.id, "t2", "{}", [], "1.2.3.4", NOW + 1);
			await repo.insertEvent(HOST_B, cfgB.id, "t3", "{}", [], "1.2.3.4", NOW + 2);

			expect(await repo.count(undefined)).toBe(3);
			expect(await repo.count(HOST_A)).toBe(2);
			expect(await repo.count(HOST_B)).toBe(1);
			expect(await repo.count("missing")).toBe(0);
		});

		test("list() joins hostname, orders newest-first, respects limit/offset", async () => {
			const cfgA = await createConfig(db, HOST_A, NOW);
			await repo.insertEvent(HOST_A, cfgA.id, "old", "{}", ["a"], "1.2.3.4", NOW);
			await repo.insertEvent(HOST_A, cfgA.id, "mid", "{}", ["b"], "1.2.3.4", NOW + 1);
			await repo.insertEvent(HOST_A, cfgA.id, "new", "{}", ["c"], "1.2.3.4", NOW + 2);

			const page1 = await repo.list(undefined, 2, 0);
			expect(page1.map((r) => r.title)).toEqual(["new", "mid"]);
			expect(page1[0]?.hostname).toBe("a.example.com");

			const page2 = await repo.list(undefined, 2, 2);
			expect(page2.map((r) => r.title)).toEqual(["old"]);
		});

		test("list() filters by host_id", async () => {
			const cfgA = await createConfig(db, HOST_A, NOW);
			const cfgB = await createConfig(db, HOST_B, NOW);
			await repo.insertEvent(HOST_A, cfgA.id, "a-event", "{}", [], "1.2.3.4", NOW);
			await repo.insertEvent(HOST_B, cfgB.id, "b-event", "{}", [], "1.2.3.4", NOW + 1);

			const aRows = await repo.list(HOST_A, 50, 0);
			expect(aRows.map((r) => r.title)).toEqual(["a-event"]);
			expect(aRows[0]?.hostname).toBe("a.example.com");
		});

		test("list() returns empty array when no rows", async () => {
			expect(await repo.list(undefined, 10, 0)).toEqual([]);
		});
	});
});
