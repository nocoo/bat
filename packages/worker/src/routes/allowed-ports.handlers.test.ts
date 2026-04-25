import { Hono } from "hono";
// Handler-level tests for allowed-ports (list + add), complementing the
// existing wire-semantics tests for DELETE.
import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../test-helpers/mock-d1";
import type { AppEnv } from "../types";
import {
	allowedPortsAllRoute,
	hostAllowedPortsAddRoute,
	hostAllowedPortsListRoute,
} from "./allowed-ports";

const HOST = "host-a";
const NOW = 1_730_000_000;

function mount(db: D1Database): Hono<AppEnv> {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.env = { DB: db, BAT_WRITE_KEY: "w", BAT_READ_KEY: "r" };
		return next();
	});
	app.get("/api/allowed-ports", allowedPortsAllRoute);
	app.get("/api/hosts/:id/allowed-ports", hostAllowedPortsListRoute);
	app.post("/api/hosts/:id/allowed-ports", hostAllowedPortsAddRoute);
	return app;
}

async function seedHost(db: D1Database, hostId: string) {
	await db
		.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, 1)")
		.bind(hostId, `${hostId}.example.com`, NOW)
		.run();
}

describe("allowed-ports routes", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(async () => {
		db = createMockD1();
		app = mount(db);
		await seedHost(db, HOST);
	});

	describe("GET /api/allowed-ports", () => {
		test("returns empty object when nothing allowed", async () => {
			const res = await app.request("http://localhost/api/allowed-ports");
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({});
		});

		test("groups ports by host_id", async () => {
			await seedHost(db, "host-b");
			await db
				.prepare("INSERT INTO port_allowlist (host_id, port, reason) VALUES (?, ?, ?)")
				.bind(HOST, 80, "web")
				.run();
			await db
				.prepare("INSERT INTO port_allowlist (host_id, port, reason) VALUES (?, ?, ?)")
				.bind(HOST, 443, "tls")
				.run();
			await db
				.prepare("INSERT INTO port_allowlist (host_id, port, reason) VALUES (?, ?, ?)")
				.bind("host-b", 22, "ssh")
				.run();

			const res = await app.request("http://localhost/api/allowed-ports");
			const json = (await res.json()) as Record<string, number[]>;
			expect(json[HOST]?.sort((a, b) => a - b)).toEqual([80, 443]);
			expect(json["host-b"]).toEqual([22]);
		});
	});

	describe("GET /api/hosts/:id/allowed-ports", () => {
		test("404 when host does not exist", async () => {
			const res = await app.request("http://localhost/api/hosts/nope/allowed-ports");
			expect(res.status).toBe(404);
		});

		test("200 with empty array when host has none", async () => {
			const res = await app.request(`http://localhost/api/hosts/${HOST}/allowed-ports`);
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual([]);
		});

		test("returns rows sorted ascending by port", async () => {
			await db
				.prepare("INSERT INTO port_allowlist (host_id, port, reason) VALUES (?, ?, ?)")
				.bind(HOST, 443, "tls")
				.run();
			await db
				.prepare("INSERT INTO port_allowlist (host_id, port, reason) VALUES (?, ?, ?)")
				.bind(HOST, 80, "web")
				.run();
			const res = await app.request(`http://localhost/api/hosts/${HOST}/allowed-ports`);
			const rows = (await res.json()) as Array<{ port: number }>;
			expect(rows.map((r) => r.port)).toEqual([80, 443]);
		});
	});

	describe("POST /api/hosts/:id/allowed-ports", () => {
		function post(hostId: string, body: unknown): Request {
			return new Request(`http://localhost/api/hosts/${hostId}/allowed-ports`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: typeof body === "string" ? body : JSON.stringify(body),
			});
		}

		test("400 on invalid JSON", async () => {
			const res = await app.request(post(HOST, "{bad"));
			expect(res.status).toBe(400);
		});

		test("400 on invalid port", async () => {
			const res = await app.request(post(HOST, { port: 0 }));
			expect(res.status).toBe(400);
		});

		test("404 when host does not exist", async () => {
			const res = await app.request(post("nope", { port: 80 }));
			expect(res.status).toBe(404);
		});

		test("201 creates a new entry", async () => {
			const res = await app.request(post(HOST, { port: 80, reason: "web" }));
			expect(res.status).toBe(201);
			const row = (await res.json()) as { port: number; reason: string };
			expect(row.port).toBe(80);
			expect(row.reason).toBe("web");
		});

		test("idempotent: re-adding the same port returns existing row with 201", async () => {
			await app.request(post(HOST, { port: 80, reason: "web" }));
			const res = await app.request(post(HOST, { port: 80, reason: "ignored" }));
			expect(res.status).toBe(201);
			const row = (await res.json()) as { port: number; reason: string };
			expect(row.port).toBe(80);
			expect(row.reason).toBe("web"); // unchanged
		});

		test("422 when exceeding MAX_ALLOWED_PORTS_PER_HOST", async () => {
			const { MAX_ALLOWED_PORTS_PER_HOST } = await import("@bat/shared");
			for (let i = 1; i <= MAX_ALLOWED_PORTS_PER_HOST; i++) {
				const r = await app.request(post(HOST, { port: i }));
				expect(r.status).toBe(201);
			}
			const over = await app.request(post(HOST, { port: MAX_ALLOWED_PORTS_PER_HOST + 1 }));
			expect(over.status).toBe(422);
		});
	});
});
