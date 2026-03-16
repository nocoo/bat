import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { apiKeyAuth } from "./api-key";

const WRITE_KEY = "test-write-key-123";
const READ_KEY = "test-read-key-456";

function createApp() {
	const app = new Hono<AppEnv>();

	// Inject test env bindings
	app.use("*", async (c, next) => {
		c.env = {
			DB: {} as D1Database,
			BAT_WRITE_KEY: WRITE_KEY,
			BAT_READ_KEY: READ_KEY,
		};
		return next();
	});

	// Apply middleware to all /api/* routes
	app.use("/api/*", apiKeyAuth);

	// Write routes
	app.post("/api/ingest", (c) => c.body(null, 204));
	app.post("/api/identity", (c) => c.body(null, 204));

	// Read routes
	app.get("/api/hosts", (c) => c.json([]));
	app.get("/api/hosts/:id/metrics", (c) => c.json([]));
	app.get("/api/alerts", (c) => c.json([]));

	// Public route
	app.get("/api/live", (c) => c.json({ status: "healthy" }));

	return app;
}

function req(method: string, path: string, key?: string): Request {
	const headers: Record<string, string> = {};
	if (key) {
		headers.Authorization = `Bearer ${key}`;
	}
	return new Request(`http://localhost${path}`, { method, headers });
}

describe("apiKeyAuth middleware", () => {
	const app = createApp();

	describe("public routes", () => {
		test("GET /api/live requires no auth", async () => {
			const res = await app.request(req("GET", "/api/live"));
			expect(res.status).toBe(200);
		});
	});

	describe("write routes", () => {
		test("POST /api/ingest accepts write key", async () => {
			const res = await app.request(req("POST", "/api/ingest", WRITE_KEY));
			expect(res.status).toBe(204);
		});

		test("POST /api/identity accepts write key", async () => {
			const res = await app.request(req("POST", "/api/identity", WRITE_KEY));
			expect(res.status).toBe(204);
		});

		test("POST /api/ingest rejects read key with 403", async () => {
			const res = await app.request(req("POST", "/api/ingest", READ_KEY));
			expect(res.status).toBe(403);
			const body = (await res.json()) as { error: string };
			expect(body.error).toContain("Read key");
		});

		test("POST /api/ingest rejects missing auth with 401", async () => {
			const res = await app.request(req("POST", "/api/ingest"));
			expect(res.status).toBe(401);
		});

		test("POST /api/ingest rejects invalid key with 403", async () => {
			const res = await app.request(req("POST", "/api/ingest", "invalid-key"));
			expect(res.status).toBe(403);
			const body = (await res.json()) as { error: string };
			expect(body.error).toContain("Invalid");
		});
	});

	describe("read routes", () => {
		test("GET /api/hosts accepts read key", async () => {
			const res = await app.request(req("GET", "/api/hosts", READ_KEY));
			expect(res.status).toBe(200);
		});

		test("GET /api/alerts accepts read key", async () => {
			const res = await app.request(req("GET", "/api/alerts", READ_KEY));
			expect(res.status).toBe(200);
		});

		test("GET /api/hosts rejects write key with 403", async () => {
			const res = await app.request(req("GET", "/api/hosts", WRITE_KEY));
			expect(res.status).toBe(403);
			const body = (await res.json()) as { error: string };
			expect(body.error).toContain("Write key");
		});

		test("GET /api/hosts rejects missing auth with 401", async () => {
			const res = await app.request(req("GET", "/api/hosts"));
			expect(res.status).toBe(401);
		});

		test("GET /api/hosts rejects invalid key with 403", async () => {
			const res = await app.request(req("GET", "/api/hosts", "bad-key"));
			expect(res.status).toBe(403);
		});
	});
});
