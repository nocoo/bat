import { Hono } from "hono";
import { beforeEach, describe, expect, test } from "vitest";
import { createD1Repositories } from "../adapters/d1/factory";
import { createMockD1 } from "../test-helpers/mock-d1";
import type { AppEnv } from "../types";
import { getRetentionDays, settingsGetRoute, settingsPutRoute } from "./settings";

function mount(db: D1Database): Hono<AppEnv> {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.env = { DB: db, BAT_WRITE_KEY: "w", BAT_READ_KEY: "r" };
		c.set("repos", createD1Repositories(db));
		return next();
	});
	app.get("/api/settings", settingsGetRoute);
	app.put("/api/settings", settingsPutRoute);
	return app;
}

describe("settings routes", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(() => {
		db = createMockD1();
		app = mount(db);
	});

	describe("GET /api/settings", () => {
		test("returns default retention_days=7 from seeded migration", async () => {
			const res = await app.request("http://localhost/api/settings");
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ retention_days: 7 });
		});

		test("returns updated value after PUT", async () => {
			await app.request("http://localhost/api/settings", {
				method: "PUT",
				body: JSON.stringify({ retention_days: 30 }),
				headers: { "Content-Type": "application/json" },
			});
			const res = await app.request("http://localhost/api/settings");
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ retention_days: 30 });
		});

		test("returns default 7 when DB has bad value", async () => {
			// Corrupt the stored value
			await db.prepare("UPDATE settings SET value = 'bad' WHERE key = 'retention_days'").run();
			const res = await app.request("http://localhost/api/settings");
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ retention_days: 7 });
		});

		test("returns default 7 when settings row is missing", async () => {
			await db.prepare("DELETE FROM settings WHERE key = 'retention_days'").run();
			const res = await app.request("http://localhost/api/settings");
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ retention_days: 7 });
		});
	});

	describe("PUT /api/settings", () => {
		test("accepts retention_days=1", async () => {
			const res = await app.request("http://localhost/api/settings", {
				method: "PUT",
				body: JSON.stringify({ retention_days: 1 }),
				headers: { "Content-Type": "application/json" },
			});
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ retention_days: 1 });
		});

		test("accepts retention_days=7", async () => {
			const res = await app.request("http://localhost/api/settings", {
				method: "PUT",
				body: JSON.stringify({ retention_days: 7 }),
				headers: { "Content-Type": "application/json" },
			});
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ retention_days: 7 });
		});

		test("accepts retention_days=30", async () => {
			const res = await app.request("http://localhost/api/settings", {
				method: "PUT",
				body: JSON.stringify({ retention_days: 30 }),
				headers: { "Content-Type": "application/json" },
			});
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ retention_days: 30 });
		});

		test("rejects invalid retention_days value with 400", async () => {
			const res = await app.request("http://localhost/api/settings", {
				method: "PUT",
				body: JSON.stringify({ retention_days: 14 }),
				headers: { "Content-Type": "application/json" },
			});
			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({ error: "retention_days must be 1, 7, or 30" });
		});

		test("rejects missing retention_days with 400", async () => {
			const res = await app.request("http://localhost/api/settings", {
				method: "PUT",
				body: JSON.stringify({}),
				headers: { "Content-Type": "application/json" },
			});
			expect(res.status).toBe(400);
		});

		test("rejects invalid JSON with 400", async () => {
			const res = await app.request("http://localhost/api/settings", {
				method: "PUT",
				body: "not-json",
				headers: { "Content-Type": "application/json" },
			});
			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({ error: "Invalid JSON body" });
		});

		test("rejects non-object body with 400", async () => {
			const res = await app.request("http://localhost/api/settings", {
				method: "PUT",
				body: JSON.stringify("string"),
				headers: { "Content-Type": "application/json" },
			});
			expect(res.status).toBe(400);
		});

		test("upserts when row already exists", async () => {
			// First update
			await app.request("http://localhost/api/settings", {
				method: "PUT",
				body: JSON.stringify({ retention_days: 1 }),
				headers: { "Content-Type": "application/json" },
			});
			// Second update
			const res = await app.request("http://localhost/api/settings", {
				method: "PUT",
				body: JSON.stringify({ retention_days: 30 }),
				headers: { "Content-Type": "application/json" },
			});
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ retention_days: 30 });
		});

		test("upserts when row is missing", async () => {
			await db.prepare("DELETE FROM settings WHERE key = 'retention_days'").run();
			const res = await app.request("http://localhost/api/settings", {
				method: "PUT",
				body: JSON.stringify({ retention_days: 1 }),
				headers: { "Content-Type": "application/json" },
			});
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ retention_days: 1 });
		});
	});

	describe("getRetentionDays helper", () => {
		test("returns 7 from seeded DB", async () => {
			expect(await getRetentionDays(db)).toBe(7);
		});

		test("returns updated value after PUT", async () => {
			await db.prepare("UPDATE settings SET value = '30' WHERE key = 'retention_days'").run();
			expect(await getRetentionDays(db)).toBe(30);
		});

		test("returns 7 for bad stored value", async () => {
			await db.prepare("UPDATE settings SET value = 'garbage' WHERE key = 'retention_days'").run();
			expect(await getRetentionDays(db)).toBe(7);
		});

		test("returns 7 for missing row", async () => {
			await db.prepare("DELETE FROM settings WHERE key = 'retention_days'").run();
			expect(await getRetentionDays(db)).toBe(7);
		});
	});
});
