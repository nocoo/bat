// L2 — Allowed-ports CRUD per host + global listing.

import type { AllowedPort } from "@bat/shared";
import { beforeAll, describe, expect, test } from "vitest";
import { BASE, assertStatus, makeIdentityPayload, readHeaders, writeHeaders } from "./helpers";

const HID = "e2e-ports-host";

describe("L2: allowed-ports CRUD", () => {
	beforeAll(async () => {
		const res = await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(makeIdentityPayload(HID)),
		});
		assertStatus(res.status, 204, "allowed-ports beforeAll identity");
	});

	test("POST /api/hosts/:id/allowed-ports → 201 (add port)", async () => {
		const res = await fetch(`${BASE}/api/hosts/${HID}/allowed-ports`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ port: 443, reason: "HTTPS" }),
		});
		expect(res.status).toBe(201);
		const port = (await res.json()) as AllowedPort;
		expect(port.port).toBe(443);
		expect(port.reason).toBe("HTTPS");
	});

	test("POST /api/hosts/:id/allowed-ports → 201 (idempotent)", async () => {
		const res = await fetch(`${BASE}/api/hosts/${HID}/allowed-ports`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ port: 443, reason: "HTTPS again" }),
		});
		expect(res.status).toBe(201);
		const port = (await res.json()) as AllowedPort;
		expect(port.port).toBe(443);
		expect(port.reason).toBe("HTTPS");
	});

	test("POST /api/hosts/:id/allowed-ports invalid port → 400", async () => {
		const res = await fetch(`${BASE}/api/hosts/${HID}/allowed-ports`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ port: 0 }),
		});
		expect(res.status).toBe(400);
	});

	test("POST /api/hosts/:id/allowed-ports unknown host → 404", async () => {
		const res = await fetch(`${BASE}/api/hosts/nonexistent-port-host/allowed-ports`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ port: 80, reason: "test" }),
		});
		expect(res.status).toBe(404);
	});

	test("GET /api/hosts/:id/allowed-ports unknown host → 404", async () => {
		const res = await fetch(`${BASE}/api/hosts/nonexistent-port-host/allowed-ports`, {
			headers: readHeaders(),
		});
		expect(res.status).toBe(404);
	});

	test("GET /api/hosts/:id/allowed-ports → lists ports", async () => {
		const res = await fetch(`${BASE}/api/hosts/${HID}/allowed-ports`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const ports = (await res.json()) as AllowedPort[];
		expect(ports.length).toBe(1);
		expect(ports[0].port).toBe(443);
	});

	test("GET /api/allowed-ports → all ports grouped by host", async () => {
		const res = await fetch(`${BASE}/api/allowed-ports`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const map = (await res.json()) as Record<string, number[]>;
		expect(map[HID]).toBeDefined();
		expect(map[HID]).toContain(443);
	});

	test("DELETE /api/hosts/:id/allowed-ports/:port → 204", async () => {
		const res = await fetch(`${BASE}/api/hosts/${HID}/allowed-ports/443`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(res.status).toBe(204);
	});

	test("DELETE /api/hosts/:id/allowed-ports/:port already removed → 404", async () => {
		const res = await fetch(`${BASE}/api/hosts/${HID}/allowed-ports/443`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(res.status).toBe(404);
	});
});
