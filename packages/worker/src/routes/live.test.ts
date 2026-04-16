import { describe, expect, test } from "bun:test";
import { BAT_VERSION, type LiveResponse } from "@bat/shared";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { liveRoute } from "./live";

function createApp(dbMock?: { prepare: () => { first: () => Promise<unknown> } }) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.env = { DB: dbMock } as unknown as AppEnv["Bindings"];
		await next();
	});
	app.get("/api/live", liveRoute);
	return app;
}

function mockD1Ok() {
	return { prepare: () => ({ first: () => Promise.resolve({ probe: 1 }) }) };
}

function mockD1Fail(message: string) {
	return { prepare: () => ({ first: () => Promise.reject(new Error(message)) }) };
}

describe("GET /api/live", () => {
	test("returns 200 with full response when DB is healthy", async () => {
		const app = createApp(mockD1Ok());
		const res = await app.request(new Request("http://localhost/api/live"));
		expect(res.status).toBe(200);
		const body = (await res.json()) as LiveResponse;
		expect(body.status).toBe("ok");
		expect(body.version).toBe(BAT_VERSION);
		expect(body.component).toBe("worker");
		expect(typeof body.timestamp).toBe("string");
		expect(typeof body.uptime).toBe("number");
		expect(body.database).toEqual({ connected: true });
	});

	test("returns 503 when DB probe fails", async () => {
		const app = createApp(mockD1Fail("connection refused"));
		const res = await app.request(new Request("http://localhost/api/live"));
		expect(res.status).toBe(503);
		const body = (await res.json()) as LiveResponse;
		expect(body.status).toBe("error");
		expect(body.database?.connected).toBe(false);
		expect(body.database?.error).toBe("connection refused");
	});

	test("sanitizes 'ok' in error messages to prevent false positives", async () => {
		const app = createApp(mockD1Fail("lookup ok.example.com failed"));
		const res = await app.request(new Request("http://localhost/api/live"));
		const body = (await res.json()) as LiveResponse;
		expect(body.database?.error).toBe("lookup ***.example.com failed");
	});

	test("includes Cache-Control: no-store header", async () => {
		const app = createApp(mockD1Ok());
		const res = await app.request(new Request("http://localhost/api/live"));
		expect(res.headers.get("Cache-Control")).toBe("no-store");
	});
});
