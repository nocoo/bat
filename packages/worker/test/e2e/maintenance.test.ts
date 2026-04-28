// L2 — Maintenance window CRUD (GET / PUT / DELETE /api/hosts/:id/maintenance)

import { hashHostId } from "@bat/shared";
import { beforeAll, describe, expect, test } from "vitest";
import { BASE, assertStatus, makeIdentityPayload, readHeaders, writeHeaders } from "./helpers";

const HID = "e2e-maint-host";

describe("L2: maintenance window CRUD", () => {
	beforeAll(async () => {
		const res = await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(makeIdentityPayload(HID)),
		});
		assertStatus(res.status, 204, "maintenance beforeAll identity");
	});

	test("GET /api/hosts/:id/maintenance unknown host → 404", async () => {
		const res = await fetch(`${BASE}/api/hosts/nonexistent-maint-host/maintenance`, {
			headers: readHeaders(),
		});
		expect(res.status).toBe(404);
	});

	test("GET /api/hosts/:id/maintenance with no window set → null", async () => {
		const res = await fetch(`${BASE}/api/hosts/${HID}/maintenance`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		expect(await res.json()).toBeNull();
	});

	test("PUT /api/hosts/:id/maintenance invalid JSON → 400", async () => {
		const res = await fetch(`${BASE}/api/hosts/${HID}/maintenance`, {
			method: "PUT",
			headers: writeHeaders(),
			body: "{not json",
		});
		expect(res.status).toBe(400);
	});

	test("PUT /api/hosts/:id/maintenance missing fields → 400", async () => {
		const res = await fetch(`${BASE}/api/hosts/${HID}/maintenance`, {
			method: "PUT",
			headers: writeHeaders(),
			body: JSON.stringify({ start: "02:00" }),
		});
		expect(res.status).toBe(400);
		expect(((await res.json()) as { error: string }).error).toContain("required");
	});

	test("PUT /api/hosts/:id/maintenance bad time format → 400", async () => {
		const res = await fetch(`${BASE}/api/hosts/${HID}/maintenance`, {
			method: "PUT",
			headers: writeHeaders(),
			body: JSON.stringify({ start: "25:00", end: "03:00" }),
		});
		expect(res.status).toBe(400);
		expect(((await res.json()) as { error: string }).error).toContain("Invalid start");
	});

	test("PUT /api/hosts/:id/maintenance start === end → 400", async () => {
		const res = await fetch(`${BASE}/api/hosts/${HID}/maintenance`, {
			method: "PUT",
			headers: writeHeaders(),
			body: JSON.stringify({ start: "02:00", end: "02:00" }),
		});
		expect(res.status).toBe(400);
		expect(((await res.json()) as { error: string }).error).toContain("different");
	});

	test("PUT /api/hosts/:id/maintenance valid window → 204, GET reflects it", async () => {
		const put = await fetch(`${BASE}/api/hosts/${HID}/maintenance`, {
			method: "PUT",
			headers: writeHeaders(),
			body: JSON.stringify({ start: "02:00", end: "04:00", reason: "nightly backup" }),
		});
		expect(put.status).toBe(204);

		// GET via hash-id form to verify resolveHostRecord accepts hashed ids too.
		const get = await fetch(`${BASE}/api/hosts/${hashHostId(HID)}/maintenance`, {
			headers: readHeaders(),
		});
		expect(get.status).toBe(200);
		const body = (await get.json()) as { start: string; end: string; reason: string };
		expect(body.start).toBe("02:00");
		expect(body.end).toBe("04:00");
		expect(body.reason).toBe("nightly backup");
	});

	test("PUT /api/hosts/:id/maintenance unknown host → 404", async () => {
		const res = await fetch(`${BASE}/api/hosts/nonexistent-maint-host/maintenance`, {
			method: "PUT",
			headers: writeHeaders(),
			body: JSON.stringify({ start: "02:00", end: "04:00" }),
		});
		expect(res.status).toBe(404);
	});

	test("DELETE /api/hosts/:id/maintenance → 204, GET returns null", async () => {
		const del = await fetch(`${BASE}/api/hosts/${HID}/maintenance`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(del.status).toBe(204);

		const get = await fetch(`${BASE}/api/hosts/${HID}/maintenance`, { headers: readHeaders() });
		expect(get.status).toBe(200);
		expect(await get.json()).toBeNull();
	});

	test("DELETE /api/hosts/:id/maintenance unknown host → 404", async () => {
		const res = await fetch(`${BASE}/api/hosts/nonexistent-maint-host/maintenance`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(res.status).toBe(404);
	});
});
