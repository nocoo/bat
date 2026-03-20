import { describe, expect, test } from "bun:test";
import { BAT_VERSION, type LiveResponse } from "@bat/shared";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { liveRoute } from "./live";

function createApp() {
	const app = new Hono<AppEnv>();
	app.get("/api/live", liveRoute);
	return app;
}

describe("GET /api/live", () => {
	test("returns 200 with ok status, version, and component", async () => {
		const app = createApp();
		const res = await app.request(new Request("http://localhost/api/live"));
		expect(res.status).toBe(200);
		const body = (await res.json()) as LiveResponse;
		expect(body.status).toBe("ok");
		expect(body.version).toBe(BAT_VERSION);
		expect(body.component).toBe("worker");
	});

	test("includes Cache-Control: no-store header", async () => {
		const app = createApp();
		const res = await app.request(new Request("http://localhost/api/live"));
		expect(res.headers.get("Cache-Control")).toBe("no-store");
	});
});
