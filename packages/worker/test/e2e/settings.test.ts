// L2 — Settings CRUD (GET / PUT /api/settings)

import { describe, expect, test } from "vitest";
import { BASE, readHeaders, writeHeaders } from "./helpers";

describe("L2: settings CRUD", () => {
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

		// Restore default
		const restoreRes = await fetch(`${BASE}/api/settings`, {
			method: "PUT",
			headers: writeHeaders(),
			body: JSON.stringify({ retention_days: 7 }),
		});
		expect(restoreRes.status).toBe(200);
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
