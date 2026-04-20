// Unit tests for access-auth middleware

import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../types.js";
import { accessAuth } from "./access-auth.js";

// Helper to create a test app with access auth middleware
function createTestApp(env: Partial<AppEnv["Bindings"]> = {}) {
	const app = new Hono<AppEnv>();

	// Set environment
	app.use("*", async (c, next) => {
		c.env = {
			DB: {} as D1Database,
			BAT_WRITE_KEY: "test-write-key",
			BAT_READ_KEY: "test-read-key",
			...env,
		} as AppEnv["Bindings"];
		return next();
	});

	app.use("*", accessAuth);

	// Test routes
	app.get("/api/live", (c) => c.json({ status: "ok" }));
	app.get("/api/hosts", (c) => c.json({ status: "ok" }));
	app.post("/api/tags", (c) => c.json({ status: "ok" }));

	return app;
}

describe("accessAuth middleware", () => {
	describe("localhost (local dev / E2E)", () => {
		test("skips JWT verification on localhost", async () => {
			const app = createTestApp({
				CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
				CF_ACCESS_AUD: "test-aud",
			});

			const res = await app.request("/api/hosts", {
				method: "GET",
				headers: { host: "localhost:8787" },
			});
			expect(res.status).toBe(200);
		});

		test("skips JWT verification on 127.0.0.1", async () => {
			const app = createTestApp({
				CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
				CF_ACCESS_AUD: "test-aud",
			});

			const res = await app.request("/api/hosts", {
				method: "GET",
				headers: { host: "127.0.0.1:8787" },
			});
			expect(res.status).toBe(200);
		});
	});

	describe("bat-ingest.* (machine endpoint)", () => {
		test("skips JWT verification for machine endpoint", async () => {
			const app = createTestApp({
				CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
				CF_ACCESS_AUD: "test-aud",
			});

			const res = await app.request("/api/hosts", {
				method: "GET",
				headers: { host: "bat-ingest.worker.hexly.ai" },
			});
			// Should pass through to next middleware (no 401/403)
			expect(res.status).toBe(200);
		});
	});

	describe("bat.* (browser endpoint)", () => {
		test("allows /api/live without JWT (public route)", async () => {
			const app = createTestApp({
				CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
				CF_ACCESS_AUD: "test-aud",
			});

			const res = await app.request("/api/live", {
				method: "GET",
				headers: { host: "bat.hexly.ai" },
			});
			expect(res.status).toBe(200);
		});

		test("returns 401 when JWT is missing", async () => {
			const app = createTestApp({
				CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
				CF_ACCESS_AUD: "test-aud",
			});

			const res = await app.request("/api/hosts", {
				method: "GET",
				headers: { host: "bat.hexly.ai" },
			});
			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.error).toBe("Missing Access JWT");
		});

		test("returns 403 when JWT is invalid", async () => {
			const app = createTestApp({
				CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
				CF_ACCESS_AUD: "test-aud",
			});

			const res = await app.request("/api/hosts", {
				method: "GET",
				headers: {
					host: "bat.hexly.ai",
					"Cf-Access-Jwt-Assertion": "invalid-jwt-token",
				},
			});
			expect(res.status).toBe(403);
			const body = await res.json();
			expect(body.error).toBe("Invalid Access JWT");
		});

		test("returns 500 when Access is not configured (fail closed)", async () => {
			const app = createTestApp({
				// No CF_ACCESS_TEAM_DOMAIN or CF_ACCESS_AUD
			});

			const res = await app.request("/api/hosts", {
				method: "GET",
				headers: { host: "bat.hexly.ai" },
			});
			// Should fail closed with 500, not pass through
			expect(res.status).toBe(500);
			const body = await res.json();
			expect(body.error).toContain("Access authentication not configured");
		});

		test("returns 500 when only team domain is configured", async () => {
			const app = createTestApp({
				CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
				// No CF_ACCESS_AUD
			});

			const res = await app.request("/api/hosts", {
				method: "GET",
				headers: { host: "bat.hexly.ai" },
			});
			expect(res.status).toBe(500);
		});
	});
});
