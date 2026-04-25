// DB-level integration tests for services/events — exercises the rate limiter,
// token lookup, event insert, and webhook CRUD helpers against the SQLite-backed
// mock D1.
import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../test-helpers/mock-d1";
import {
	checkRateLimit,
	createWebhookConfig,
	deleteWebhookConfig,
	findWebhookByToken,
	insertEvent,
	listWebhookConfigs,
	regenerateWebhookToken,
} from "./events";

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

describe("services/events DB helpers", () => {
	let db: D1Database;
	beforeEach(async () => {
		db = createMockD1();
		await seedHosts(db);
	});

	test("createWebhookConfig inserts a row and returns it", async () => {
		const row = await createWebhookConfig(db, HOST_A, NOW);
		expect(row.host_id).toBe(HOST_A);
		expect(row.token).toMatch(/^[0-9a-f]{32}$/);
		expect(row.is_active).toBe(1);
		expect(row.created_at).toBe(NOW);
	});

	test("findWebhookByToken returns the active config, null on miss or inactive", async () => {
		const row = await createWebhookConfig(db, HOST_A, NOW);
		const hit = await findWebhookByToken(db, row.token);
		expect(hit?.id).toBe(row.id);

		expect(await findWebhookByToken(db, "does-not-exist")).toBeNull();

		await db.prepare("UPDATE webhook_configs SET is_active = 0 WHERE id = ?").bind(row.id).run();
		expect(await findWebhookByToken(db, row.token)).toBeNull();
	});

	test("listWebhookConfigs joins hostname and orders by created_at desc", async () => {
		const a = await createWebhookConfig(db, HOST_A, NOW);
		const b = await createWebhookConfig(db, HOST_B, NOW + 10);
		const list = await listWebhookConfigs(db);
		expect(list.map((r) => r.id)).toEqual([b.id, a.id]);
		expect(list[0]?.hostname).toBe("b.example.com");
		expect(list[1]?.hostname).toBe("a.example.com");
	});

	test("deleteWebhookConfig returns true on hit, false on miss", async () => {
		const row = await createWebhookConfig(db, HOST_A, NOW);
		expect(await deleteWebhookConfig(db, row.id)).toBe(true);
		expect(await deleteWebhookConfig(db, row.id)).toBe(false);
		expect(await deleteWebhookConfig(db, 9999)).toBe(false);
	});

	test("regenerateWebhookToken mutates token and returns new value; null on missing id", async () => {
		const row = await createWebhookConfig(db, HOST_A, NOW);
		const fresh = await regenerateWebhookToken(db, row.id, NOW + 5);
		expect(fresh).toMatch(/^[0-9a-f]{32}$/);
		expect(fresh).not.toBe(row.token);

		expect(await regenerateWebhookToken(db, 9999, NOW + 5)).toBeNull();
	});

	test("insertEvent persists a row with serialized tags", async () => {
		const row = await createWebhookConfig(db, HOST_A, NOW);
		await insertEvent(db, HOST_A, row.id, "hello", '{"k":1}', ["a", "b"], "1.2.3.4", NOW);
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

	describe("checkRateLimit", () => {
		test("first request opens a window and returns true", async () => {
			const row = await createWebhookConfig(db, HOST_A, NOW);
			expect(await checkRateLimit(db, row.id, 3, NOW)).toBe(true);
		});

		test("returns true while count <= limit, false once exceeded", async () => {
			const row = await createWebhookConfig(db, HOST_A, NOW);
			// limit = 2 → first two return true, third returns false
			expect(await checkRateLimit(db, row.id, 2, NOW)).toBe(true);
			expect(await checkRateLimit(db, row.id, 2, NOW + 1)).toBe(true);
			expect(await checkRateLimit(db, row.id, 2, NOW + 2)).toBe(false);
		});

		test("resets counter when a new minute window starts", async () => {
			const row = await createWebhookConfig(db, HOST_A, NOW);
			expect(await checkRateLimit(db, row.id, 1, NOW)).toBe(true);
			// Same minute → over limit
			expect(await checkRateLimit(db, row.id, 1, NOW + 30)).toBe(false);
			// Next minute → fresh window, allowed again
			expect(await checkRateLimit(db, row.id, 1, NOW + 60)).toBe(true);
		});

		test("returns false when config id is missing", async () => {
			expect(await checkRateLimit(db, 9999, 10, NOW)).toBe(false);
		});
	});
});
