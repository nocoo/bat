// Deployment-wide workstation reads for the external monitoring key.
// BAT_READ_KEY can read them; BAT_WRITE_KEY, asset tokens and access sessions
// without a key cannot.

import { describe, expect, test } from "vitest";
import { app } from "../index.js";
import { connectFixture, WORKSTATION_A } from "../test-helpers/connect.js";

const HOST = "http://localhost";

describe("monitoring workstation reads", () => {
	test("BAT_READ_KEY reads list, detail, metrics and connectivity", async () => {
		const f = await connectFixture();
		// The fixture seeds reports at its own receipt second; a window captured before
		// it would exclude the newest sample at a one-second boundary.
		const now = Math.floor(Date.now() / 1000);
		const read = { Authorization: "Bearer legacy-read" };
		const list = await app.request(`${HOST}/api/monitoring/workstations`, { headers: read }, f.env);
		expect(list.status).toBe(200);
		const records = (await list.json()) as { id: string }[];
		expect(records.map((row) => row.id)).toContain(WORKSTATION_A);

		const detail = await app.request(
			`${HOST}/api/monitoring/workstations/${WORKSTATION_A}`,
			{ headers: read },
			f.env,
		);
		expect(detail.status).toBe(200);
		expect(await detail.json()).toMatchObject({ id: WORKSTATION_A, disabled: false });

		const metrics = await app.request(
			`${HOST}/api/monitoring/workstations/${WORKSTATION_A}/metrics?from=${now - 3600}&to=${now}`,
			{ headers: read },
			f.env,
		);
		expect(metrics.status).toBe(200);
		expect(await metrics.json()).toMatchObject({
			data: [{ uptime_seconds: 86_400 }],
			page: { limit: 100, offset: 0, next_offset: null },
		});

		const fullPage = await app.request(
			`${HOST}/api/monitoring/workstations/${WORKSTATION_A}/metrics?from=${now - 3600}&to=${now}&limit=1`,
			{ headers: read },
			f.env,
		);
		expect(await fullPage.json()).toMatchObject({
			page: { limit: 1, next_offset: 1 },
		});

		const connectivity = await app.request(
			`${HOST}/api/monitoring/workstations/${WORKSTATION_A}/connectivity?from=${now - 3600}&to=${now}&limit=10`,
			{ headers: read },
			f.env,
		);
		expect(connectivity.status).toBe(200);
		const body = (await connectivity.json()) as {
			targets: { server_id: string; data: unknown[] }[];
			limit: number;
		};
		expect(body.limit).toBe(10);
		expect(body.targets.map((target) => target.server_id).sort()).toEqual([
			"connect-server-a",
			"connect-server-b",
		]);
	});

	test("unknown workstations answer 404 and invalid windows 400", async () => {
		const f = await connectFixture();
		const read = { Authorization: "Bearer legacy-read" };
		expect(
			(
				await app.request(
					`${HOST}/api/monitoring/workstations/99999999-9999-4999-8999-999999999999`,
					{ headers: read },
					f.env,
				)
			).status,
		).toBe(404);
		for (const path of ["metrics", "connectivity"]) {
			expect(
				(
					await app.request(
						`${HOST}/api/monitoring/workstations/99999999-9999-4999-8999-999999999999/${path}`,
						{ headers: read },
						f.env,
					)
				).status,
			).toBe(404);
			expect(
				(
					await app.request(
						`${HOST}/api/monitoring/workstations/${WORKSTATION_A}/${path}?from=0&to=9999999999`,
						{ headers: read },
						f.env,
					)
				).status,
			).toBe(400);
			expect(
				(
					await app.request(
						`${HOST}/api/monitoring/workstations/${WORKSTATION_A}/${path}?limit=101`,
						{ headers: read },
						f.env,
					)
				).status,
			).toBe(400);
		}
	});

	test("the write key, asset tokens and Connect keys cannot use the monitoring lane", async () => {
		const f = await connectFixture();
		const key = await f.mint("read", [], null, [WORKSTATION_A]);
		for (const [name, headers] of [
			["write key", { Authorization: "Bearer legacy-write" }],
			["Connect key", { Authorization: `Bearer ${key.secret}` }],
			["no key", {}],
		] as const) {
			const response = await app.request(`${HOST}/api/monitoring/workstations`, { headers }, f.env);
			expect(response.status, name).toBeGreaterThanOrEqual(401);
			expect(response.status, name).toBeLessThanOrEqual(403);
		}
	});
});
