// Unit tests for entry-control middleware

import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import type { AppEnv } from "../types.js";
import { entryControl, isLocalhost, isMachineEndpoint } from "./entry-control.js";

// Helper to create a test app with entry control middleware
function createTestApp() {
	const app = new Hono<AppEnv>();
	app.use("*", entryControl);

	// Test routes
	app.get("/api/live", (c) => c.json({ status: "ok" }));
	app.post("/api/ingest", (c) => c.json({ status: "ok" }));
	app.post("/api/identity", (c) => c.json({ status: "ok" }));
	app.post("/api/tier2", (c) => c.json({ status: "ok" }));
	app.post("/api/events", (c) => c.json({ status: "ok" }));
	app.get("/api/monitoring/hosts", (c) => c.json({ status: "ok" }));
	app.get("/api/monitoring/hosts/:id", (c) => c.json({ status: "ok" }));
	app.get("/api/monitoring/alerts", (c) => c.json({ status: "ok" }));
	app.get("/api/monitoring/groups", (c) => c.json({ status: "ok" }));
	app.get("/api/hosts", (c) => c.json({ status: "ok" }));
	app.get("/api/hosts/:id", (c) => c.json({ status: "ok" }));
	app.get("/api/alerts", (c) => c.json({ status: "ok" }));
	app.get("/api/events", (c) => c.json({ status: "ok" }));
	app.post("/api/tags", (c) => c.json({ status: "ok" }));
	app.put("/api/tags/:id", (c) => c.json({ status: "ok" }));
	app.delete("/api/tags/:id", (c) => c.json({ status: "ok" }));
	app.post("/api/webhooks", (c) => c.json({ status: "ok" }));
	app.delete("/api/webhooks/:id", (c) => c.json({ status: "ok" }));

	return app;
}

describe("isLocalhost", () => {
	test("returns true for localhost", () => {
		expect(isLocalhost("localhost")).toBe(true);
		expect(isLocalhost("localhost:8787")).toBe(true);
		expect(isLocalhost("localhost:17025")).toBe(true);
	});

	test("returns true for 127.0.0.1", () => {
		expect(isLocalhost("127.0.0.1")).toBe(true);
		expect(isLocalhost("127.0.0.1:8787")).toBe(true);
	});

	test("returns false for production hosts", () => {
		expect(isLocalhost("bat.hexly.ai")).toBe(false);
		expect(isLocalhost("bat-ingest.worker.hexly.ai")).toBe(false);
	});
});

describe("isMachineEndpoint", () => {
	test("returns true for bat-ingest hosts", () => {
		expect(isMachineEndpoint("bat-ingest.worker.hexly.ai")).toBe(true);
		expect(isMachineEndpoint("bat-ingest-test.worker.hexly.ai")).toBe(true);
	});

	test("returns false for browser hosts", () => {
		expect(isMachineEndpoint("bat.hexly.ai")).toBe(false);
		expect(isMachineEndpoint("localhost:8787")).toBe(false);
	});
});

describe("entryControl middleware", () => {
	describe("localhost (local dev / E2E)", () => {
		test("allows all routes on localhost", async () => {
			const app = createTestApp();

			// Machine routes
			let res = await app.request("/api/ingest", {
				method: "POST",
				headers: { host: "localhost:17025" },
			});
			expect(res.status).toBe(200);

			res = await app.request("/api/monitoring/hosts", {
				method: "GET",
				headers: { host: "localhost:8787" },
			});
			expect(res.status).toBe(200);

			// Browser routes (also allowed on localhost for testing)
			res = await app.request("/api/hosts", {
				method: "GET",
				headers: { host: "localhost:8787" },
			});
			expect(res.status).toBe(200);

			res = await app.request("/api/tags", {
				method: "POST",
				headers: { host: "localhost:8787" },
			});
			expect(res.status).toBe(200);
		});

		test("allows all routes on 127.0.0.1", async () => {
			const app = createTestApp();

			const res = await app.request("/api/hosts", {
				method: "GET",
				headers: { host: "127.0.0.1:8787" },
			});
			expect(res.status).toBe(200);
		});
	});

	describe("bat-ingest.* (machine endpoint)", () => {
		const machineHost = "bat-ingest.worker.hexly.ai";

		test("allows POST /api/ingest", async () => {
			const app = createTestApp();
			const res = await app.request("/api/ingest", {
				method: "POST",
				headers: { host: machineHost },
			});
			expect(res.status).toBe(200);
		});

		test("allows POST /api/identity", async () => {
			const app = createTestApp();
			const res = await app.request("/api/identity", {
				method: "POST",
				headers: { host: machineHost },
			});
			expect(res.status).toBe(200);
		});

		test("allows POST /api/tier2", async () => {
			const app = createTestApp();
			const res = await app.request("/api/tier2", {
				method: "POST",
				headers: { host: machineHost },
			});
			expect(res.status).toBe(200);
		});

		test("allows POST /api/events (webhook)", async () => {
			const app = createTestApp();
			const res = await app.request("/api/events", {
				method: "POST",
				headers: { host: machineHost },
			});
			expect(res.status).toBe(200);
		});

		test("allows GET /api/monitoring/*", async () => {
			const app = createTestApp();

			let res = await app.request("/api/monitoring/hosts", {
				method: "GET",
				headers: { host: machineHost },
			});
			expect(res.status).toBe(200);

			res = await app.request("/api/monitoring/hosts/abc123", {
				method: "GET",
				headers: { host: machineHost },
			});
			expect(res.status).toBe(200);

			res = await app.request("/api/monitoring/alerts", {
				method: "GET",
				headers: { host: machineHost },
			});
			expect(res.status).toBe(200);

			res = await app.request("/api/monitoring/groups", {
				method: "GET",
				headers: { host: machineHost },
			});
			expect(res.status).toBe(200);
		});

		test("allows GET /api/live (public)", async () => {
			const app = createTestApp();
			const res = await app.request("/api/live", {
				method: "GET",
				headers: { host: machineHost },
			});
			expect(res.status).toBe(200);
		});

		test("blocks GET /api/events (browser route)", async () => {
			const app = createTestApp();
			const res = await app.request("/api/events", {
				method: "GET",
				headers: { host: machineHost },
			});
			expect(res.status).toBe(403);
			const body = await res.json();
			expect(body.error).toBe("Route not allowed on machine endpoint");
		});

		test("blocks GET /api/hosts (browser route)", async () => {
			const app = createTestApp();
			const res = await app.request("/api/hosts", {
				method: "GET",
				headers: { host: machineHost },
			});
			expect(res.status).toBe(403);
		});

		test("blocks GET /api/alerts (browser route)", async () => {
			const app = createTestApp();
			const res = await app.request("/api/alerts", {
				method: "GET",
				headers: { host: machineHost },
			});
			expect(res.status).toBe(403);
		});

		test("blocks POST /api/tags (browser write route)", async () => {
			const app = createTestApp();
			const res = await app.request("/api/tags", {
				method: "POST",
				headers: { host: machineHost },
			});
			expect(res.status).toBe(403);
		});

		test("blocks POST /api/webhooks (browser write route)", async () => {
			const app = createTestApp();
			const res = await app.request("/api/webhooks", {
				method: "POST",
				headers: { host: machineHost },
			});
			expect(res.status).toBe(403);
		});

		test("blocks DELETE /api/webhooks/:id (browser write route)", async () => {
			const app = createTestApp();
			const res = await app.request("/api/webhooks/123", {
				method: "DELETE",
				headers: { host: machineHost },
			});
			expect(res.status).toBe(403);
		});
	});

	describe("bat.* (browser endpoint)", () => {
		const browserHost = "bat.hexly.ai";

		test("allows all routes to pass through (for accessAuth to handle)", async () => {
			const app = createTestApp();

			// Browser read routes
			let res = await app.request("/api/hosts", {
				method: "GET",
				headers: { host: browserHost },
			});
			expect(res.status).toBe(200);

			res = await app.request("/api/alerts", {
				method: "GET",
				headers: { host: browserHost },
			});
			expect(res.status).toBe(200);

			res = await app.request("/api/events", {
				method: "GET",
				headers: { host: browserHost },
			});
			expect(res.status).toBe(200);

			// Browser write routes
			res = await app.request("/api/tags", {
				method: "POST",
				headers: { host: browserHost },
			});
			expect(res.status).toBe(200);

			// Public route
			res = await app.request("/api/live", {
				method: "GET",
				headers: { host: browserHost },
			});
			expect(res.status).toBe(200);
		});
	});
});
