import { beforeEach, describe, expect, test } from "bun:test";
import type { IdentityPayload } from "@bat/shared";
import { Hono } from "hono";
import { createMockD1 } from "../test-helpers/mock-d1";
import type { AppEnv } from "../types";
import { identityRoute } from "./identity";

const WRITE_KEY = "test-write-key";

function makePayload(overrides?: Partial<IdentityPayload>): IdentityPayload {
	return {
		host_id: "host-001",
		hostname: "web-1",
		os: "Ubuntu 24.04",
		kernel: "6.8.0-generic",
		arch: "x86_64",
		cpu_model: "AMD EPYC 7763",
		uptime_seconds: 86400,
		boot_time: 1700000000,
		...overrides,
	};
}

function createApp(db: D1Database) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.env = { DB: db, BAT_WRITE_KEY: WRITE_KEY, BAT_READ_KEY: "rk" };
		return next();
	});
	app.post("/api/identity", identityRoute);
	return app;
}

function post(app: Hono<AppEnv>, body: unknown) {
	return app.request(
		new Request("http://localhost/api/identity", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

describe("POST /api/identity", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(() => {
		db = createMockD1();
		app = createApp(db);
	});

	test("valid identity → 204, host created", async () => {
		const res = await post(app, makePayload());
		expect(res.status).toBe(204);

		const row = await db
			.prepare("SELECT * FROM hosts WHERE host_id = ?")
			.bind("host-001")
			.first<Record<string, unknown>>();

		expect(row).not.toBeNull();
		expect(row?.hostname).toBe("web-1");
		expect(row?.os).toBe("Ubuntu 24.04");
		expect(row?.kernel).toBe("6.8.0-generic");
		expect(row?.arch).toBe("x86_64");
		expect(row?.cpu_model).toBe("AMD EPYC 7763");
		expect(row?.boot_time).toBe(1700000000);
		expect(row?.is_active).toBe(1);
		expect(typeof row?.last_seen).toBe("number");
		expect(typeof row?.identity_updated_at).toBe("number");
	});

	test("update existing → fields overwritten", async () => {
		// Create initial host
		await post(app, makePayload());

		// Update with new identity
		const updated = makePayload({
			hostname: "web-1-renamed",
			os: "Debian 13",
			kernel: "6.12.0-generic",
			arch: "aarch64",
			cpu_model: "Neoverse V2",
			boot_time: 1700100000,
		});
		const res = await post(app, updated);
		expect(res.status).toBe(204);

		const row = await db
			.prepare("SELECT * FROM hosts WHERE host_id = ?")
			.bind("host-001")
			.first<Record<string, unknown>>();

		expect(row?.hostname).toBe("web-1-renamed");
		expect(row?.os).toBe("Debian 13");
		expect(row?.kernel).toBe("6.12.0-generic");
		expect(row?.arch).toBe("aarch64");
		expect(row?.cpu_model).toBe("Neoverse V2");
		expect(row?.boot_time).toBe(1700100000);
		// is_active should be untouched
		expect(row?.is_active).toBe(1);
	});

	test("retired host → 403", async () => {
		// Insert a retired host
		const now = Math.floor(Date.now() / 1000);
		await db
			.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, 0)")
			.bind("host-001", "old-host", now)
			.run();

		const res = await post(app, makePayload());
		expect(res.status).toBe(403);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("host is retired");
	});

	test("invalid payload — missing required field → 400", async () => {
		const res = await post(app, { host_id: "h1" });
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("Invalid");
	});

	test("invalid payload — wrong types → 400", async () => {
		const res = await post(app, makePayload({ boot_time: "not-a-number" as unknown as number }));
		expect(res.status).toBe(400);
	});

	test("invalid payload — empty host_id → 400", async () => {
		const res = await post(app, makePayload({ host_id: "" }));
		expect(res.status).toBe(400);
	});

	test("invalid JSON body → 400", async () => {
		const res = await app.request(
			new Request("http://localhost/api/identity", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not json",
			}),
		);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("Invalid JSON");
	});

	test("last_seen and identity_updated_at use Worker time, not Probe time", async () => {
		const beforeTs = Math.floor(Date.now() / 1000);
		await post(app, makePayload({ boot_time: 1000000000 }));
		const afterTs = Math.floor(Date.now() / 1000);

		const row = await db
			.prepare("SELECT last_seen, identity_updated_at FROM hosts WHERE host_id = ?")
			.bind("host-001")
			.first<{ last_seen: number; identity_updated_at: number }>();

		expect(row?.last_seen).toBeGreaterThanOrEqual(beforeTs);
		expect(row?.last_seen).toBeLessThanOrEqual(afterTs);
		expect(row?.identity_updated_at).toBeGreaterThanOrEqual(beforeTs);
		expect(row?.identity_updated_at).toBeLessThanOrEqual(afterTs);
	});
});
