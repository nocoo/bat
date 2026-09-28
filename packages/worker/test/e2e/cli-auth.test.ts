import { describe, expect, test } from "vitest";
import { BASE, readHeaders } from "./helpers";

describe("L2: CLI auth and token management", () => {
	test("POST /api/auth/cli rejects without CF Access JWT", async () => {
		const res = await fetch(`${BASE}/api/auth/cli`, {
			method: "POST",
			headers: { ...readHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({ label: "test", scope: "assets" }),
		});
		expect(res.status).toBe(403);
	});

	test("GET /api/auth/cli rejects without CF Access JWT", async () => {
		const res = await fetch(
			`${BASE}/api/auth/cli?callback=http://127.0.0.1:9999/callback&state=nonce`,
			{ headers: readHeaders(), redirect: "manual" },
		);
		expect(res.status).toBe(403);
	});

	test("GET /api/cli-tokens returns list", async () => {
		const res = await fetch(`${BASE}/api/cli-tokens`, { headers: readHeaders() });
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
