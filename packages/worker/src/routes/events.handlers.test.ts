// Handler-level tests for /api/events (list + ingest).
import { beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createWebhookConfig } from "../services/events";
import { createMockD1 } from "../test-helpers/mock-d1";
import type { AppEnv } from "../types";
import { eventsIngestRoute } from "./events-ingest";
import { eventsListRoute } from "./events-list";

const HOST = "host-a";
const PUBLIC_IP = "1.2.3.4";
const NOW = 1_730_000_000;

function mount(db: D1Database): Hono<AppEnv> {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.env = { DB: db, BAT_WRITE_KEY: "w", BAT_READ_KEY: "r" };
		return next();
	});
	app.get("/api/events", eventsListRoute);
	app.post("/api/events", eventsIngestRoute);
	return app;
}

async function seedHost(db: D1Database, hostId: string, publicIp: string | null) {
	await db
		.prepare(
			"INSERT INTO hosts (host_id, hostname, last_seen, is_active, public_ip) VALUES (?, ?, ?, 1, ?)",
		)
		.bind(hostId, `${hostId}.example.com`, NOW, publicIp)
		.run();
}

async function createToken(db: D1Database, hostId: string): Promise<string> {
	const row = await createWebhookConfig(db, hostId, NOW);
	return row.token;
}

function ingestReq(token: string, ip: string | null, body: unknown): Request {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json",
	};
	if (ip) {
		headers["CF-Connecting-IP"] = ip;
	}
	return new Request("http://localhost/api/events", {
		method: "POST",
		headers,
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

describe("POST /api/events (ingest)", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(async () => {
		db = createMockD1();
		app = mount(db);
		await seedHost(db, HOST, PUBLIC_IP);
	});

	test("401 without Authorization header", async () => {
		const res = await app.request("http://localhost/api/events", {
			method: "POST",
			body: "{}",
			headers: { "Content-Type": "application/json" },
		});
		expect(res.status).toBe(401);
	});

	test("401 on malformed Authorization header", async () => {
		const res = await app.request("http://localhost/api/events", {
			method: "POST",
			body: "{}",
			headers: { Authorization: "Basic abc", "Content-Type": "application/json" },
		});
		expect(res.status).toBe(401);
	});

	test("403 for unknown token", async () => {
		const res = await app.request(ingestReq("unknown-token", PUBLIC_IP, {}));
		expect(res.status).toBe(403);
	});

	test("400 when CF-Connecting-IP missing", async () => {
		const token = await createToken(db, HOST);
		const res = await app.request(ingestReq(token, null, { title: "x", body: {} }));
		expect(res.status).toBe(400);
	});

	test("403 when host has no public_ip registered", async () => {
		await seedHost(db, "host-b", null);
		const token = await createToken(db, "host-b");
		const res = await app.request(ingestReq(token, PUBLIC_IP, { title: "x", body: {} }));
		expect(res.status).toBe(403);
	});

	test("403 when source IP doesn't match host public_ip", async () => {
		const token = await createToken(db, HOST);
		const res = await app.request(ingestReq(token, "9.9.9.9", { title: "x", body: {} }));
		expect(res.status).toBe(403);
	});

	test("400 on invalid JSON body", async () => {
		const token = await createToken(db, HOST);
		const res = await app.request(ingestReq(token, PUBLIC_IP, "not-json{"));
		expect(res.status).toBe(400);
	});

	test("400 on payload validation failure", async () => {
		const token = await createToken(db, HOST);
		const res = await app.request(ingestReq(token, PUBLIC_IP, { body: {} }));
		expect(res.status).toBe(400);
	});

	test("204 on successful ingest and row is persisted", async () => {
		const token = await createToken(db, HOST);
		const res = await app.request(
			ingestReq(token, PUBLIC_IP, { title: "hello", body: { k: 1 }, tags: ["x"] }),
		);
		expect(res.status).toBe(204);
		const row = await db.prepare("SELECT title, tags, source_ip FROM events").first<{
			title: string;
			tags: string;
			source_ip: string;
		}>();
		expect(row?.title).toBe("hello");
		expect(row?.tags).toBe('["x"]');
		expect(row?.source_ip).toBe(PUBLIC_IP);
	});

	test("429 once rate limit is exceeded", async () => {
		const token = await createToken(db, HOST);
		// Shrink the limit to 1 request per minute
		await db.prepare("UPDATE webhook_configs SET rate_limit = 1").run();
		const ok = await app.request(ingestReq(token, PUBLIC_IP, { title: "a", body: {} }));
		expect(ok.status).toBe(204);
		const over = await app.request(ingestReq(token, PUBLIC_IP, { title: "b", body: {} }));
		expect(over.status).toBe(429);
	});
});

describe("GET /api/events (list)", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(async () => {
		db = createMockD1();
		app = mount(db);
		await seedHost(db, HOST, PUBLIC_IP);
		await seedHost(db, "host-b", PUBLIC_IP);
		const token = await createToken(db, HOST);
		// seed 3 events for HOST, 1 for host-b
		for (let i = 0; i < 3; i++) {
			await app.request(ingestReq(token, PUBLIC_IP, { title: `a-${i}`, body: {}, tags: ["t"] }));
		}
		const tokenB = await createToken(db, "host-b");
		await app.request(ingestReq(tokenB, PUBLIC_IP, { title: "b-0", body: {}, tags: [] }));
	});

	test("returns all events with total count", async () => {
		const res = await app.request("http://localhost/api/events");
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			items: Array<{ title: string; tags: string[] }>;
			total: number;
			limit: number;
			offset: number;
		};
		expect(body.total).toBe(4);
		expect(body.items).toHaveLength(4);
		expect(body.limit).toBe(30);
		expect(body.offset).toBe(0);
		// tags should be parsed back from JSON
		const withTags = body.items.find((i) => i.tags.length > 0);
		expect(withTags?.tags).toEqual(["t"]);
	});

	test("filters by host_id", async () => {
		const res = await app.request(`http://localhost/api/events?host_id=${HOST}`);
		const body = (await res.json()) as { total: number; items: Array<{ title: string }> };
		expect(body.total).toBe(3);
		expect(body.items.every((i) => i.title.startsWith("a-"))).toBe(true);
	});

	test("honours limit + offset", async () => {
		const res = await app.request("http://localhost/api/events?limit=2&offset=1");
		const body = (await res.json()) as {
			total: number;
			limit: number;
			offset: number;
			items: unknown[];
		};
		expect(body.total).toBe(4);
		expect(body.limit).toBe(2);
		expect(body.offset).toBe(1);
		expect(body.items).toHaveLength(2);
	});
});
