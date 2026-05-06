// L2 — CLI auth + token management routes
// These routes require CF Access JWT for minting (browser-only), so in local
// E2E we verify the expected 403 rejection and token CRUD via the localhost bypass.

import { describe, expect, test } from "vitest";
import { BASE, readHeaders } from "./helpers";

describe("L2: CLI auth and token management", () => {
	test("POST /api/auth/cli rejects without CF Access JWT", async () => {
		const res = await fetch(`${BASE}/api/auth/cli`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ label: "test", scope: "assets" }),
		});
		// Localhost bypasses API key auth but cliAuthRoute checks accessAuthenticated
		expect(res.status).toBe(403);
	});

	test("GET /api/auth/cli rejects without CF Access JWT", async () => {
		const res = await fetch(
			`${BASE}/api/auth/cli?callback=http://127.0.0.1:9999/callback&state=nonce`,
		);
		// Localhost bypasses API key auth but cliAuthBridgeRoute checks accessAuthenticated
		expect(res.status).toBe(403);
	});

	test("GET /api/cli-tokens returns list", async () => {
		const res = await fetch(`${BASE}/api/cli-tokens`, { headers: readHeaders() });
		// Localhost bypass allows this — returns empty array or existing tokens
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(Array.isArray(data)).toBe(true);
	});

	test("DELETE /api/cli-tokens/:id returns 404 for non-existent", async () => {
		const res = await fetch(`${BASE}/api/cli-tokens/9999`, {
			method: "DELETE",
			headers: readHeaders(),
		});
		expect(res.status).toBe(404);
	});
});
