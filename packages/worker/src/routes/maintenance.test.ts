// Maintenance CRUD route tests
import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../test-helpers/mock-d1.js";

import { maintenanceDeleteRoute, maintenanceGetRoute, maintenanceSetRoute } from "./maintenance.js";

function makeContext(db: D1Database, method: string, idParam: string, body?: unknown) {
	return {
		env: { DB: db },
		req: {
			param: (key: string) => (key === "id" ? idParam : ""),
			method,
			json: () => Promise.resolve(body),
		},
		json: (data: unknown, status?: number) => {
			return new Response(JSON.stringify(data), {
				status: status ?? 200,
				headers: { "Content-Type": "application/json" },
			});
		},
	} as unknown as Parameters<typeof maintenanceGetRoute>[0];
}

describe("maintenance CRUD routes", () => {
	let db: D1Database;
	const HOST_ID = "test-host-001";

	beforeEach(async () => {
		db = createMockD1();
		// Seed an active host
		await db
			.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, 1)")
			.bind(HOST_ID, "test.example.com", Math.floor(Date.now() / 1000))
			.run();
	});

	describe("GET /api/hosts/:id/maintenance", () => {
		test("returns null when no window is set", async () => {
			const c = makeContext(db, "GET", HOST_ID);
			const res = await maintenanceGetRoute(c);
			expect(res.status).toBe(200);
			expect(await res.json()).toBeNull();
		});

		test("returns window when set", async () => {
			await db
				.prepare(
					"UPDATE hosts SET maintenance_start = ?, maintenance_end = ?, maintenance_reason = ? WHERE host_id = ?",
				)
				.bind("03:00", "05:00", "Nightly backup", HOST_ID)
				.run();

			const c = makeContext(db, "GET", HOST_ID);
			const res = await maintenanceGetRoute(c);
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				start: "03:00",
				end: "05:00",
				reason: "Nightly backup",
			});
		});

		test("returns reason as empty string when null", async () => {
			await db
				.prepare("UPDATE hosts SET maintenance_start = ?, maintenance_end = ? WHERE host_id = ?")
				.bind("03:00", "05:00", HOST_ID)
				.run();

			const c = makeContext(db, "GET", HOST_ID);
			const res = await maintenanceGetRoute(c);
			const data = await res.json();
			expect(data.reason).toBe("");
		});

		test("404 for non-existent host", async () => {
			const c = makeContext(db, "GET", "non-existent");
			const res = await maintenanceGetRoute(c);
			expect(res.status).toBe(404);
		});
	});

	describe("PUT /api/hosts/:id/maintenance", () => {
		test("sets a maintenance window", async () => {
			const c = makeContext(db, "PUT", HOST_ID, {
				start: "03:00",
				end: "05:00",
				reason: "Nightly backup",
			});
			const res = await maintenanceSetRoute(c);
			expect(res.status).toBe(204);

			// Verify
			const row = await db
				.prepare(
					"SELECT maintenance_start, maintenance_end, maintenance_reason FROM hosts WHERE host_id = ?",
				)
				.bind(HOST_ID)
				.first<{
					maintenance_start: string | null;
					maintenance_end: string | null;
					maintenance_reason: string | null;
				}>();
			expect(row.maintenance_start).toBe("03:00");
			expect(row.maintenance_end).toBe("05:00");
			expect(row.maintenance_reason).toBe("Nightly backup");
		});

		test("updates an existing window", async () => {
			// Set initial
			await db
				.prepare(
					"UPDATE hosts SET maintenance_start = ?, maintenance_end = ?, maintenance_reason = ? WHERE host_id = ?",
				)
				.bind("03:00", "05:00", "old", HOST_ID)
				.run();

			// Update
			const c = makeContext(db, "PUT", HOST_ID, {
				start: "22:00",
				end: "02:00",
				reason: "Cross-midnight",
			});
			const res = await maintenanceSetRoute(c);
			expect(res.status).toBe(204);

			const row = await db
				.prepare(
					"SELECT maintenance_start, maintenance_end, maintenance_reason FROM hosts WHERE host_id = ?",
				)
				.bind(HOST_ID)
				.first<{
					maintenance_start: string | null;
					maintenance_end: string | null;
					maintenance_reason: string | null;
				}>();
			expect(row.maintenance_start).toBe("22:00");
			expect(row.maintenance_end).toBe("02:00");
		});

		test("reason is optional", async () => {
			const c = makeContext(db, "PUT", HOST_ID, {
				start: "03:00",
				end: "05:00",
			});
			const res = await maintenanceSetRoute(c);
			expect(res.status).toBe(204);
		});

		test("validates start format", async () => {
			const c = makeContext(db, "PUT", HOST_ID, {
				start: "3:00",
				end: "05:00",
			});
			const res = await maintenanceSetRoute(c);
			expect(res.status).toBe(400);
		});

		test("validates end format", async () => {
			const c = makeContext(db, "PUT", HOST_ID, {
				start: "03:00",
				end: "25:00",
			});
			const res = await maintenanceSetRoute(c);
			expect(res.status).toBe(400);
		});

		test("rejects start === end", async () => {
			const c = makeContext(db, "PUT", HOST_ID, {
				start: "03:00",
				end: "03:00",
			});
			const res = await maintenanceSetRoute(c);
			expect(res.status).toBe(400);
		});

		test("rejects reason > 200 chars", async () => {
			const c = makeContext(db, "PUT", HOST_ID, {
				start: "03:00",
				end: "05:00",
				reason: "x".repeat(201),
			});
			const res = await maintenanceSetRoute(c);
			expect(res.status).toBe(400);
		});

		test("404 for non-existent host", async () => {
			const c = makeContext(db, "PUT", "non-existent", {
				start: "03:00",
				end: "05:00",
			});
			const res = await maintenanceSetRoute(c);
			expect(res.status).toBe(404);
		});

		test("403 for retired host", async () => {
			await db.prepare("UPDATE hosts SET is_active = 0 WHERE host_id = ?").bind(HOST_ID).run();

			const c = makeContext(db, "PUT", HOST_ID, {
				start: "03:00",
				end: "05:00",
			});
			const res = await maintenanceSetRoute(c);
			expect(res.status).toBe(403);
		});
	});

	describe("DELETE /api/hosts/:id/maintenance", () => {
		test("clears maintenance window", async () => {
			// Set first
			await db
				.prepare(
					"UPDATE hosts SET maintenance_start = ?, maintenance_end = ?, maintenance_reason = ? WHERE host_id = ?",
				)
				.bind("03:00", "05:00", "reason", HOST_ID)
				.run();

			const c = makeContext(db, "DELETE", HOST_ID);
			const res = await maintenanceDeleteRoute(c);
			expect(res.status).toBe(204);

			// Verify
			const row = await db
				.prepare(
					"SELECT maintenance_start, maintenance_end, maintenance_reason FROM hosts WHERE host_id = ?",
				)
				.bind(HOST_ID)
				.first<{
					maintenance_start: string | null;
					maintenance_end: string | null;
					maintenance_reason: string | null;
				}>();
			expect(row.maintenance_start).toBeNull();
			expect(row.maintenance_end).toBeNull();
			expect(row.maintenance_reason).toBeNull();
		});

		test("404 for non-existent host", async () => {
			const c = makeContext(db, "DELETE", "non-existent");
			const res = await maintenanceDeleteRoute(c);
			expect(res.status).toBe(404);
		});

		test("403 for retired host", async () => {
			await db.prepare("UPDATE hosts SET is_active = 0 WHERE host_id = ?").bind(HOST_ID).run();

			const c = makeContext(db, "DELETE", HOST_ID);
			const res = await maintenanceDeleteRoute(c);
			expect(res.status).toBe(403);
		});
	});

	describe("full CRUD lifecycle", () => {
		test("PUT → GET → PUT (update) → GET → DELETE → GET (null)", async () => {
			// PUT
			let c = makeContext(db, "PUT", HOST_ID, {
				start: "03:00",
				end: "05:00",
				reason: "Backup",
			});
			let res = await maintenanceSetRoute(c);
			expect(res.status).toBe(204);

			// GET
			c = makeContext(db, "GET", HOST_ID);
			res = await maintenanceGetRoute(c);
			expect(await res.json()).toEqual({
				start: "03:00",
				end: "05:00",
				reason: "Backup",
			});

			// PUT (update)
			c = makeContext(db, "PUT", HOST_ID, {
				start: "22:00",
				end: "02:00",
				reason: "Reboot",
			});
			res = await maintenanceSetRoute(c);
			expect(res.status).toBe(204);

			// GET (updated)
			c = makeContext(db, "GET", HOST_ID);
			res = await maintenanceGetRoute(c);
			expect(await res.json()).toEqual({
				start: "22:00",
				end: "02:00",
				reason: "Reboot",
			});

			// DELETE
			c = makeContext(db, "DELETE", HOST_ID);
			res = await maintenanceDeleteRoute(c);
			expect(res.status).toBe(204);

			// GET (null)
			c = makeContext(db, "GET", HOST_ID);
			res = await maintenanceGetRoute(c);
			expect(await res.json()).toBeNull();
		});
	});

	describe("edge cases", () => {
		test("resolves hid (8-hex) to host_id for GET", async () => {
			const { hashHostId } = await import("@bat/shared");
			await db
				.prepare("UPDATE hosts SET maintenance_start = ?, maintenance_end = ? WHERE host_id = ?")
				.bind("01:00", "02:00", HOST_ID)
				.run();

			const hid = hashHostId(HOST_ID);
			const c = makeContext(db, "GET", hid);
			const res = await maintenanceGetRoute(c);
			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data.start).toBe("01:00");
		});

		test("resolves hid (8-hex) to host_id for PUT", async () => {
			const { hashHostId } = await import("@bat/shared");
			const hid = hashHostId(HOST_ID);
			const c = makeContext(db, "PUT", hid, { start: "10:00", end: "11:00" });
			const res = await maintenanceSetRoute(c);
			expect(res.status).toBe(204);
		});

		test("hid (8-hex) that matches no host → 404", async () => {
			const c = makeContext(db, "GET", "deadbeef");
			const res = await maintenanceGetRoute(c);
			expect(res.status).toBe(404);
		});

		test("invalid JSON body → 400", async () => {
			const c = {
				env: { DB: db },
				req: {
					param: (key: string) => (key === "id" ? HOST_ID : ""),
					method: "PUT",
					json: () => Promise.reject(new Error("bad json")),
				},
				json: (data: unknown, status?: number) =>
					new Response(JSON.stringify(data), {
						status: status ?? 200,
						headers: { "Content-Type": "application/json" },
					}),
			} as unknown as Parameters<typeof maintenanceSetRoute>[0];
			const res = await maintenanceSetRoute(c);
			expect(res.status).toBe(400);
			const body = (await res.json()) as { error: string };
			expect(body.error).toContain("Invalid JSON");
		});

		test("missing start → 400", async () => {
			const c = makeContext(db, "PUT", HOST_ID, { end: "05:00" });
			const res = await maintenanceSetRoute(c);
			expect(res.status).toBe(400);
			const body = (await res.json()) as { error: string };
			expect(body.error).toContain("required");
		});

		test("missing end → 400", async () => {
			const c = makeContext(db, "PUT", HOST_ID, { start: "03:00" });
			const res = await maintenanceSetRoute(c);
			expect(res.status).toBe(400);
		});

		test("reason non-string (number) → 400", async () => {
			const c = makeContext(db, "PUT", HOST_ID, {
				start: "03:00",
				end: "05:00",
				reason: 123,
			});
			const res = await maintenanceSetRoute(c);
			expect(res.status).toBe(400);
			const body = (await res.json()) as { error: string };
			expect(body.error).toContain("string");
		});
	});
});
