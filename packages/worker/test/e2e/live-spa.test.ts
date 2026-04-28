// L2 — root SPA + /api/live
// See test/e2e/global-setup.ts for boot semantics.

import { describe, expect, test } from "vitest";
import { BASE } from "./helpers";

describe("L2: SPA root + live", () => {
	test("GET / returns SPA HTML", async () => {
		const res = await fetch(`${BASE}/`);
		expect(res.status).toBe(200);
		const text = await res.text();
		expect(text).toContain("<!DOCTYPE html>");
		expect(text).toContain("Bat Dashboard");
	});

	test("GET /api/live → 200", async () => {
		const res = await fetch(`${BASE}/api/live`);
		expect(res.status).toBe(200);
	});
});
