// L2 — GET /api/hosts/:id/tier2 (read latest tier2 snapshot)

import { hashHostId } from "@bat/shared";
import { beforeAll, describe, expect, test } from "vitest";
import { BASE, assertStatus, makeIdentityPayload, readHeaders, writeHeaders } from "./helpers";

const HID = "e2e-tier2-read";

describe("L2: tier2 read", () => {
	beforeAll(async () => {
		const ident = await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(makeIdentityPayload(HID)),
		});
		assertStatus(ident.status, 204, "tier2-read beforeAll identity");
	});

	test("GET /api/hosts/:id/tier2 unknown hash → 404", async () => {
		const res = await fetch(`${BASE}/api/hosts/0000000000000000/tier2`, {
			headers: readHeaders(),
		});
		expect(res.status).toBe(404);
	});

	test("GET /api/hosts/:id/tier2 host without tier2 data → 404", async () => {
		// Host exists, but no /api/tier2 has been ingested for it yet.
		const res = await fetch(`${BASE}/api/hosts/${hashHostId(HID)}/tier2`, {
			headers: readHeaders(),
		});
		expect(res.status).toBe(404);
		expect(((await res.json()) as { error: string }).error).toContain("tier2");
	});

	test("GET /api/hosts/:id/tier2 after tier2 ingest → snapshot", async () => {
		const t2 = await fetch(`${BASE}/api/tier2`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				host_id: HID,
				timestamp: Math.floor(Date.now() / 1000),
				timezone: "UTC",
				dns_resolvers: ["1.1.1.1"],
			}),
		});
		assertStatus(t2.status, 204, "tier2-read ingest");

		const res = await fetch(`${BASE}/api/hosts/${hashHostId(HID)}/tier2`, {
			headers: readHeaders(),
		});
		expect(res.status).toBe(200);
		const snapshot = (await res.json()) as Record<string, unknown>;
		// Shape varies by signal — at minimum the response must be a non-error object.
		expect(snapshot).not.toHaveProperty("error");
	});
});
