import { beforeEach, describe, expect, test } from "bun:test";
import type { AlertItem } from "@bat/shared";
import { Hono } from "hono";
import { createMockD1 } from "../test-helpers/mock-d1";
import type { AppEnv } from "../types";
import { alertsListRoute } from "./alerts";

const READ_KEY = "test-read-key";

function createApp(db: D1Database) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.env = { DB: db, BAT_WRITE_KEY: "wk", BAT_READ_KEY: READ_KEY };
		return next();
	});
	app.get("/api/alerts", alertsListRoute);
	return app;
}

function get(app: Hono<AppEnv>) {
	return app.request(new Request("http://localhost/api/alerts"));
}

async function insertHost(
	db: D1Database,
	hostId: string,
	hostname: string,
	lastSeen: number,
	isActive = 1,
) {
	await db
		.prepare(
			"INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, ?)",
		)
		.bind(hostId, hostname, lastSeen, isActive)
		.run();
}

async function insertAlert(
	db: D1Database,
	hostId: string,
	ruleId: string,
	severity: string,
	triggeredAt: number,
	message: string,
) {
	await db
		.prepare(
			"INSERT INTO alert_states (host_id, rule_id, severity, value, triggered_at, message) VALUES (?, ?, ?, 95.0, ?, ?)",
		)
		.bind(hostId, ruleId, severity, triggeredAt, message)
		.run();
}

describe("GET /api/alerts", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(() => {
		db = createMockD1();
		app = createApp(db);
	});

	test("returns empty array when no alerts", async () => {
		const res = await get(app);
		expect(res.status).toBe(200);
		const body = (await res.json()) as AlertItem[];
		expect(body).toEqual([]);
	});

	test("returns AlertItem[] with hostname joined", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", "web-server-1", now);
		await insertAlert(db, "host-001", "disk_full", "critical", now, "Disk / at 95.0%");

		const res = await get(app);
		expect(res.status).toBe(200);
		const body = (await res.json()) as AlertItem[];
		expect(body).toHaveLength(1);

		const alert = body[0];
		expect(alert.host_id).toBe("host-001");
		expect(alert.hostname).toBe("web-server-1");
		expect(alert.rule_id).toBe("disk_full");
		expect(alert.severity).toBe("critical");
		expect(alert.value).toBe(95.0);
		expect(alert.triggered_at).toBe(now);
		expect(alert.message).toBe("Disk / at 95.0%");
	});

	test("excludes retired hosts", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", "active-server", now, 1);
		await insertHost(db, "host-002", "retired-server", now, 0);
		await insertAlert(db, "host-001", "disk_full", "critical", now, "active alert");
		await insertAlert(db, "host-002", "mem_high", "critical", now, "retired alert");

		const res = await get(app);
		const body = (await res.json()) as AlertItem[];
		expect(body).toHaveLength(1);
		expect(body[0].host_id).toBe("host-001");
	});

	test("orders by triggered_at DESC (newest first)", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", "server-1", now);
		await insertAlert(db, "host-001", "disk_full", "critical", now - 100, "older alert");
		await insertAlert(db, "host-001", "mem_high", "critical", now, "newest alert");
		await insertAlert(db, "host-001", "iowait_high", "warning", now - 50, "middle alert");

		const res = await get(app);
		const body = (await res.json()) as AlertItem[];
		expect(body).toHaveLength(3);
		expect(body[0].triggered_at).toBe(now);
		expect(body[1].triggered_at).toBe(now - 50);
		expect(body[2].triggered_at).toBe(now - 100);
	});

	test("returns alerts from multiple hosts", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", "server-1", now);
		await insertHost(db, "host-002", "server-2", now);
		await insertAlert(db, "host-001", "disk_full", "critical", now, "host-1 disk");
		await insertAlert(db, "host-002", "mem_high", "critical", now - 10, "host-2 mem");

		const res = await get(app);
		const body = (await res.json()) as AlertItem[];
		expect(body).toHaveLength(2);
		// Newest first
		expect(body[0].host_id).toBe("host-001");
		expect(body[1].host_id).toBe("host-002");
	});
});
