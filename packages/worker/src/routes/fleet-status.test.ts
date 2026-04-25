import { beforeEach, describe, expect, test } from "vitest";
import { BAT_VERSION, type HealthResponse } from "@bat/shared";
import { Hono } from "hono";
import { createMockD1 } from "../test-helpers/mock-d1";
import type { AppEnv } from "../types";
import { fleetStatusRoute } from "./fleet-status";

function createApp(db: D1Database) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.env = { DB: db, BAT_WRITE_KEY: "wk", BAT_READ_KEY: "rk" };
		return next();
	});
	app.get("/api/fleet/status", fleetStatusRoute);
	return app;
}

function get(app: Hono<AppEnv>) {
	return app.request(new Request("http://localhost/api/fleet/status"));
}

async function insertHost(db: D1Database, hostId: string, lastSeen: number, isActive = 1) {
	await db
		.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, ?)")
		.bind(hostId, hostId, lastSeen, isActive)
		.run();
}

async function insertAlert(
	db: D1Database,
	hostId: string,
	ruleId: string,
	severity: string,
	triggeredAt: number,
) {
	await db
		.prepare(
			"INSERT INTO alert_states (host_id, rule_id, severity, value, triggered_at, message) VALUES (?, ?, ?, 95.0, ?, 'test')",
		)
		.bind(hostId, ruleId, severity, triggeredAt)
		.run();
}

describe("GET /api/fleet/status", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(() => {
		db = createMockD1();
		app = createApp(db);
	});

	test("all healthy → 200, status: healthy, includes version", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", now);
		await insertHost(db, "host-002", now);

		const res = await get(app);
		expect(res.status).toBe(200);
		const body = (await res.json()) as HealthResponse;
		expect(body.status).toBe("healthy");
		expect(body.version).toBe(BAT_VERSION);
		expect(body.total_hosts).toBe(2);
		expect(body.healthy).toBe(2);
		expect(body.warning).toBe(0);
		expect(body.critical).toBe(0);
		expect(body.checked_at).toBeGreaterThan(0);
	});

	test("warning only → 200, status: degraded", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", now);
		await insertHost(db, "host-002", now);
		await insertAlert(db, "host-001", "iowait_high", "warning", now);

		const res = await get(app);
		expect(res.status).toBe(200);
		const body = (await res.json()) as HealthResponse;
		expect(body.status).toBe("degraded");
		expect(body.version).toBe(BAT_VERSION);
		expect(body.healthy).toBe(1);
		expect(body.warning).toBe(1);
		expect(body.critical).toBe(0);
	});

	test("critical alert → 200, status: critical", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", now);
		await insertAlert(db, "host-001", "disk_full", "critical", now);

		const res = await get(app);
		expect(res.status).toBe(200);
		const body = (await res.json()) as HealthResponse;
		expect(body.status).toBe("critical");
		expect(body.version).toBe(BAT_VERSION);
		expect(body.critical).toBe(1);
	});

	test("offline detection → counted as critical", async () => {
		const now = Math.floor(Date.now() / 1000);
		const stale = now - 200; // 200s > 120s threshold
		await insertHost(db, "host-001", stale);

		const res = await get(app);
		expect(res.status).toBe(200);
		const body = (await res.json()) as HealthResponse;
		expect(body.status).toBe("critical");
		expect(body.version).toBe(BAT_VERSION);
		expect(body.critical).toBe(1);
		expect(body.healthy).toBe(0);
	});

	test("zero hosts → 200, status: empty", async () => {
		const res = await get(app);
		expect(res.status).toBe(200);
		const body = (await res.json()) as HealthResponse;
		expect(body.status).toBe("empty");
		expect(body.version).toBe(BAT_VERSION);
		expect(body.total_hosts).toBe(0);
	});

	test("mixed statuses: healthy + warning + critical", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", now); // healthy
		await insertHost(db, "host-002", now); // warning
		await insertAlert(db, "host-002", "steal_high", "warning", now);
		await insertHost(db, "host-003", now); // critical
		await insertAlert(db, "host-003", "disk_full", "critical", now);

		const res = await get(app);
		expect(res.status).toBe(200);
		const body = (await res.json()) as HealthResponse;
		expect(body.status).toBe("critical");
		expect(body.version).toBe(BAT_VERSION);
		expect(body.total_hosts).toBe(3);
		expect(body.healthy).toBe(1);
		expect(body.warning).toBe(1);
		expect(body.critical).toBe(1);
	});

	test("retired hosts excluded from fleet status", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", now, 1); // active
		await insertHost(db, "host-002", now, 0); // retired

		const res = await get(app);
		const body = (await res.json()) as HealthResponse;
		expect(body.total_hosts).toBe(1);
		expect(body.version).toBe(BAT_VERSION);
	});
});
