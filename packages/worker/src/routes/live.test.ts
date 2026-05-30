import { BAT_VERSION, type LiveResponse } from "@bat/shared";
import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import type { HostsRepository } from "../repos/types";
import type { AppEnv } from "../types";
import { liveRoute } from "./live";

function createApp(repo: Partial<HostsRepository>) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.env = {} as unknown as AppEnv["Bindings"];
		c.set("repos", { hosts: repo as HostsRepository } as unknown as AppEnv["Variables"]["repos"]);
		await next();
	});
	app.get("/api/live", liveRoute);
	return app;
}

const probeOk: Partial<HostsRepository> = {
	probe: async () => {
		// no-op — healthy DB
	},
};
function probeFail(message: string): Partial<HostsRepository> {
	return {
		probe: () => Promise.reject(new Error(message)),
	};
}

describe("GET /api/live", () => {
	test("returns 200 with full response when DB is healthy", async () => {
		const app = createApp(probeOk);
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
		const app = createApp(probeFail("connection refused"));
		const res = await app.request(new Request("http://localhost/api/live"));
		expect(res.status).toBe(503);
		const body = (await res.json()) as LiveResponse;
		expect(body.status).toBe("error");
		expect(body.database?.connected).toBe(false);
		expect(body.database?.error).toBe("connection refused");
	});

	test("sanitizes 'ok' in error messages to prevent false positives", async () => {
		const app = createApp(probeFail("lookup ok.example.com failed"));
		const res = await app.request(new Request("http://localhost/api/live"));
		const body = (await res.json()) as LiveResponse;
		expect(body.database?.error).toBe("lookup ***.example.com failed");
	});

	test("includes Cache-Control: no-store header", async () => {
		const app = createApp(probeOk);
		const res = await app.request(new Request("http://localhost/api/live"));
		expect(res.headers.get("Cache-Control")).toBe("no-store");
	});
});
