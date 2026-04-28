// L2 — /api/fleet/status (READ_KEY-protected fleet summary)

import type { HealthResponse } from "@bat/shared";
import { beforeAll, describe, expect, test } from "vitest";
import { BASE, assertStatus, makeIdentityPayload, readHeaders, writeHeaders } from "./helpers";

const HID = "e2e-fleet-status-host";

describe("L2: fleet status", () => {
	beforeAll(async () => {
		// Ensure at least one host exists, regardless of test file ordering.
		const res = await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(makeIdentityPayload(HID)),
		});
		assertStatus(res.status, 204, "fleet-status beforeAll identity");
	});

	test("GET /api/fleet/status → 200 with HealthResponse shape", async () => {
		const res = await fetch(`${BASE}/api/fleet/status`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as HealthResponse;
		expect(body.total_hosts).toBeGreaterThan(0);
		expect(body.healthy + body.warning + body.critical + body.maintenance).toBe(body.total_hosts);
		expect(["empty", "healthy", "degraded", "critical"]).toContain(body.status);
		expect(typeof body.version).toBe("string");
		expect(typeof body.checked_at).toBe("number");
	});
});
