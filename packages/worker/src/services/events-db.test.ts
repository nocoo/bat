// DB-level integration tests for the event-ingest helpers in
// `services/events.ts` (token lookup, rate limit, event insert). Webhook
// *config* CRUD has moved to `adapters/d1/webhooks.test.ts` (C2).
// The remaining helpers below migrate to `adapters/d1/events.ts` in C8.

import { beforeEach, describe, expect, test } from "vitest";
import { D1WebhooksRepository } from "../adapters/d1/webhooks";
import { createMockD1 } from "../test-helpers/mock-d1";
import { checkRateLimit, findWebhookByToken, insertEvent } from "./events";

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

async function createConfig(db: D1Database, hostId: string, now: number) {
	const result = await new D1WebhooksRepository(db).create(hostId, now);
	if (result.ok !== true) {
		throw new Error(`createConfig failed: ${result.ok}`);
	}
	return result.row;
}

describe("services/events ingest helpers", () => {
	let db: D1Database;
	beforeEach(async () => {
		db = createMockD1();
		await seedHosts(db);
	});

	test("findWebhookByToken returns the active config, null on miss or inactive", async () => {
		const row = await createConfig(db, HOST_A, NOW);
		const hit = await findWebhookByToken(db, row.token);
		expect(hit?.id).toBe(row.id);

		expect(await findWebhookByToken(db, "does-not-exist")).toBeNull();

		await db.prepare("UPDATE webhook_configs SET is_active = 0 WHERE id = ?").bind(row.id).run();
		expect(await findWebhookByToken(db, row.token)).toBeNull();
	});

	test("insertEvent persists a row with serialized tags", async () => {
		const row = await createConfig(db, HOST_A, NOW);
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
			const row = await createConfig(db, HOST_A, NOW);
			expect(await checkRateLimit(db, row.id, 3, NOW)).toBe(true);
		});

		test("returns true while count <= limit, false once exceeded", async () => {
			const row = await createConfig(db, HOST_A, NOW);
			// limit = 2 → first two return true, third returns false
			expect(await checkRateLimit(db, row.id, 2, NOW)).toBe(true);
			expect(await checkRateLimit(db, row.id, 2, NOW + 1)).toBe(true);
			expect(await checkRateLimit(db, row.id, 2, NOW + 2)).toBe(false);
		});

		test("resets counter when a new minute window starts", async () => {
			const row = await createConfig(db, HOST_A, NOW);
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
