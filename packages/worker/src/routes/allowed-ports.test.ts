// Route-level regression tests for allowed-ports DELETE handler.
// Specifically pins the wire contract for :port validation so future
// refactors don't silently narrow the accepted range.
import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../test-helpers/mock-d1.js";
import { hostAllowedPortsRemoveRoute } from "./allowed-ports.js";

function makeContext(db: D1Database, hostId: string, portParam: string) {
	return {
		env: { DB: db },
		req: {
			param: (key: string) => {
				if (key === "id") {
					return hostId;
				}
				if (key === "port") {
					return portParam;
				}
				return "";
			},
			method: "DELETE",
		},
		json: (data: unknown, status?: number) =>
			new Response(JSON.stringify(data), {
				status: status ?? 200,
				headers: { "Content-Type": "application/json" },
			}),
		body: (_data: unknown, status?: number) => new Response(null, { status: status ?? 200 }),
	} as unknown as Parameters<typeof hostAllowedPortsRemoveRoute>[0];
}

describe("DELETE /api/hosts/:id/allowed-ports/:port — wire semantics", () => {
	let db: D1Database;
	const HOST_ID = "test-host-001";

	beforeEach(async () => {
		db = createMockD1();
		await db
			.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, 1)")
			.bind(HOST_ID, "test.example.com", Math.floor(Date.now() / 1000))
			.run();
		await db
			.prepare("INSERT INTO port_allowlist (host_id, port, reason) VALUES (?, ?, ?)")
			.bind(HOST_ID, 8080, "web")
			.run();
	});

	test("returns 204 when an allowed port is removed", async () => {
		const res = await hostAllowedPortsRemoveRoute(makeContext(db, HOST_ID, "8080"));
		expect(res.status).toBe(204);
	});

	test("returns 400 for non-numeric port params", async () => {
		const res = await hostAllowedPortsRemoveRoute(makeContext(db, HOST_ID, "abc"));
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "Invalid port number" });
	});

	test("returns 400 for empty port param", async () => {
		const res = await hostAllowedPortsRemoveRoute(makeContext(db, HOST_ID, ""));
		expect(res.status).toBe(400);
	});

	// Regression: out-of-range integers must fall through to 404, not 400.
	// Before the parsePortParam extraction this was the observed behaviour,
	// and API clients may rely on the distinction between
	//   400 "Invalid port number"            (malformed input)
	//   404 "Port not found in allowlist"    (valid number, not listed)
	test("returns 404 for out-of-range integer ports (0, -1, 65536)", async () => {
		for (const p of ["0", "-1", "65536", "999999"]) {
			const res = await hostAllowedPortsRemoveRoute(makeContext(db, HOST_ID, p));
			expect(res.status).toBe(404);
			expect(await res.json()).toEqual({ error: "Port not found in allowlist" });
		}
	});

	test("returns 404 for a valid in-range port that isn't allowlisted", async () => {
		const res = await hostAllowedPortsRemoveRoute(makeContext(db, HOST_ID, "22"));
		expect(res.status).toBe(404);
	});
});
