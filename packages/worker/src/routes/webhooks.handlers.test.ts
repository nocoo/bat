// Handler-level tests for webhooks CRUD routes.
import { beforeEach, describe, expect, test } from "vitest";
import { Hono } from "hono";
import { createMockD1 } from "../test-helpers/mock-d1";
import type { AppEnv } from "../types";
import {
	webhooksCreateRoute,
	webhooksDeleteRoute,
	webhooksListRoute,
	webhooksRegenerateRoute,
} from "./webhooks";

function mount(db: D1Database): Hono<AppEnv> {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.env = { DB: db, BAT_WRITE_KEY: "w", BAT_READ_KEY: "r" };
		return next();
	});
	app.get("/api/webhooks", webhooksListRoute);
	app.post("/api/webhooks", webhooksCreateRoute);
	app.delete("/api/webhooks/:id", webhooksDeleteRoute);
	app.post("/api/webhooks/:id/regenerate", webhooksRegenerateRoute);
	return app;
}

async function seedHost(db: D1Database, hostId: string) {
	await db
		.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, 1)")
		.bind(hostId, `${hostId}.example.com`, 1_730_000_000)
		.run();
}

describe("webhook routes", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(async () => {
		db = createMockD1();
		app = mount(db);
		await seedHost(db, "host-a");
	});

	describe("POST /api/webhooks", () => {
		test("400 on invalid JSON", async () => {
			const res = await app.request("http://localhost/api/webhooks", {
				method: "POST",
				body: "{not-json",
				headers: { "Content-Type": "application/json" },
			});
			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({ error: "Invalid JSON body" });
		});

		test("400 on missing host_id", async () => {
			const res = await app.request("http://localhost/api/webhooks", {
				method: "POST",
				body: "{}",
				headers: { "Content-Type": "application/json" },
			});
			expect(res.status).toBe(400);
		});

		test("404 when host does not exist", async () => {
			const res = await app.request("http://localhost/api/webhooks", {
				method: "POST",
				body: JSON.stringify({ host_id: "nope" }),
				headers: { "Content-Type": "application/json" },
			});
			expect(res.status).toBe(404);
		});

		test("201 creates a config and returns wire DTO (is_active boolean)", async () => {
			const res = await app.request("http://localhost/api/webhooks", {
				method: "POST",
				body: JSON.stringify({ host_id: "host-a" }),
				headers: { "Content-Type": "application/json" },
			});
			expect(res.status).toBe(201);
			const json = (await res.json()) as Record<string, unknown>;
			expect(json.host_id).toBe("host-a");
			expect(json.is_active).toBe(true);
			expect(typeof json.token).toBe("string");
		});

		test("409 on duplicate (UNIQUE host_id)", async () => {
			await app.request("http://localhost/api/webhooks", {
				method: "POST",
				body: JSON.stringify({ host_id: "host-a" }),
				headers: { "Content-Type": "application/json" },
			});
			const res = await app.request("http://localhost/api/webhooks", {
				method: "POST",
				body: JSON.stringify({ host_id: "host-a" }),
				headers: { "Content-Type": "application/json" },
			});
			expect(res.status).toBe(409);
		});
	});

	describe("GET /api/webhooks", () => {
		test("returns configs with hostname joined in", async () => {
			await app.request("http://localhost/api/webhooks", {
				method: "POST",
				body: JSON.stringify({ host_id: "host-a" }),
				headers: { "Content-Type": "application/json" },
			});
			const res = await app.request("http://localhost/api/webhooks");
			expect(res.status).toBe(200);
			const list = (await res.json()) as Record<string, unknown>[];
			expect(list).toHaveLength(1);
			expect(list[0]?.hostname).toBe("host-a.example.com");
			expect(list[0]?.is_active).toBe(true);
		});
	});

	describe("DELETE /api/webhooks/:id", () => {
		test("400 for non-numeric id", async () => {
			const res = await app.request("http://localhost/api/webhooks/abc", { method: "DELETE" });
			expect(res.status).toBe(400);
		});

		test("404 when id is not found", async () => {
			const res = await app.request("http://localhost/api/webhooks/9999", { method: "DELETE" });
			expect(res.status).toBe(404);
		});

		test("204 on successful delete", async () => {
			const createRes = await app.request("http://localhost/api/webhooks", {
				method: "POST",
				body: JSON.stringify({ host_id: "host-a" }),
				headers: { "Content-Type": "application/json" },
			});
			const { id } = (await createRes.json()) as { id: number };
			const res = await app.request(`http://localhost/api/webhooks/${id}`, { method: "DELETE" });
			expect(res.status).toBe(204);
		});
	});

	describe("POST /api/webhooks/:id/regenerate", () => {
		test("400 for non-numeric id", async () => {
			const res = await app.request("http://localhost/api/webhooks/abc/regenerate", {
				method: "POST",
			});
			expect(res.status).toBe(400);
		});

		test("404 when id is not found", async () => {
			const res = await app.request("http://localhost/api/webhooks/9999/regenerate", {
				method: "POST",
			});
			expect(res.status).toBe(404);
		});

		test("200 returns a new token different from the old one", async () => {
			const createRes = await app.request("http://localhost/api/webhooks", {
				method: "POST",
				body: JSON.stringify({ host_id: "host-a" }),
				headers: { "Content-Type": "application/json" },
			});
			const { id, token } = (await createRes.json()) as { id: number; token: string };
			const res = await app.request(`http://localhost/api/webhooks/${id}/regenerate`, {
				method: "POST",
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { token: string };
			expect(body.token).toMatch(/^[0-9a-f]{32}$/);
			expect(body.token).not.toBe(token);
		});
	});
});
