// L2 — /api/monitoring/* read endpoints (consumed by Uptime Kuma).
// All four require BAT_READ_KEY; localhost still bypasses key auth so we
// only assert shape, not auth chain (auth chain is in api-key.test.ts).

import { describe, expect, test } from "vitest";
import { BASE, readHeaders } from "./helpers";

describe("L2: monitoring endpoints", () => {
	test("GET /api/monitoring/hosts → list with status field", async () => {
		const res = await fetch(`${BASE}/api/monitoring/hosts`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { status: string; hosts?: unknown[]; groups?: unknown[] };
		expect(body.status).toBe("ok");
	});

	test("GET /api/monitoring/groups → list", async () => {
		const res = await fetch(`${BASE}/api/monitoring/groups`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { status: string; groups: unknown[] };
		expect(body.status).toBe("ok");
		expect(Array.isArray(body.groups)).toBe(true);
	});

	test("GET /api/monitoring/alerts → list", async () => {
		const res = await fetch(`${BASE}/api/monitoring/alerts`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { status: string };
		expect(body.status).toBe("ok");
	});

	test("GET /api/monitoring/hosts/:id unknown host → 404", async () => {
		const res = await fetch(`${BASE}/api/monitoring/hosts/nonexistent-mon-host`, {
			headers: readHeaders(),
		});
		expect(res.status).toBe(404);
	});
});
