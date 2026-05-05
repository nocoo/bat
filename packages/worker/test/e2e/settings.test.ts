// L2 — Settings CRUD (GET / PUT /api/settings)

import { afterEach, describe, expect, test } from "vitest";
import { BASE, readHeaders, writeHeaders } from "./helpers";

describe("L2: settings CRUD", () => {
	// Restore default retention_days after every test so parallel/subsequent
	// tests always start with a clean state — even if an assertion fails.
	afterEach(async () => {
		await fetch(`${BASE}/api/settings`, {
			method: "PUT",
			headers: writeHeaders(),
			body: JSON.stringify({ retention_days: 7 }),
		});
	});

	test("GET /api/settings returns default retention_days=7", async () => {
		const res = await fetch(`${BASE}/api/settings`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ retention_days: 7 });
	});

	test("PUT /api/settings updates retention_days", async () => {
		const putRes = await fetch(`${BASE}/api/settings`, {
			method: "PUT",
			headers: writeHeaders(),
			body: JSON.stringify({ retention_days: 30 }),
		});
		expect(putRes.status).toBe(200);
		expect(await putRes.json()).toEqual({ retention_days: 30 });

		// Verify GET reflects the update
		const getRes = await fetch(`${BASE}/api/settings`, { headers: readHeaders() });
		expect(getRes.status).toBe(200);
		expect(await getRes.json()).toEqual({ retention_days: 30 });
	});

	test("PUT /api/settings rejects invalid value", async () => {
		const res = await fetch(`${BASE}/api/settings`, {
			method: "PUT",
			headers: writeHeaders(),
			body: JSON.stringify({ retention_days: 14 }),
		});
		expect(res.status).toBe(400);
	});
});
