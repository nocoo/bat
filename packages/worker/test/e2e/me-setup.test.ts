// L2 — /api/me + /api/setup (auxiliary read endpoints used by the UI shell).

import { describe, expect, test } from "vitest";
import { BASE } from "./helpers";

describe("L2: me + setup", () => {
	test("GET /api/me without Cf-Access-Jwt-Assertion → anonymous", async () => {
		// Local wrangler doesn't inject an Access JWT; the route should
		// return authenticated:false rather than 4xx.
		const res = await fetch(`${BASE}/api/me`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { email: null | string; authenticated: boolean };
		expect(body.authenticated).toBe(false);
		expect(body.email).toBeNull();
	});

	test("GET /api/me with malformed JWT → anonymous (decode failure tolerated)", async () => {
		const res = await fetch(`${BASE}/api/me`, {
			headers: { "Cf-Access-Jwt-Assertion": "not.a.jwt" },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { authenticated: boolean };
		expect(body.authenticated).toBe(false);
	});

	test("GET /api/setup → returns worker_url", async () => {
		const res = await fetch(`${BASE}/api/setup`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { worker_url: string };
		// localhost path: protocol is http and host is the wrangler dev origin.
		expect(body.worker_url).toMatch(/^https?:\/\/localhost:\d+$/);
	});
});
