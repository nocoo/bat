import { beforeEach, describe, expect, test } from "bun:test";
import type { HostOverviewItem } from "@bat/shared";
import { Hono } from "hono";
import { createMockD1 } from "../test-helpers/mock-d1";
import type { AppEnv } from "../types";
import { hostsListRoute } from "./hosts";

const READ_KEY = "test-read-key";

function createApp(db: D1Database) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.env = { DB: db, BAT_WRITE_KEY: "wk", BAT_READ_KEY: READ_KEY };
		return next();
	});
	app.get("/api/hosts", hostsListRoute);
	return app;
}

function get(app: Hono<AppEnv>) {
	return app.request(new Request("http://localhost/api/hosts"));
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
			"INSERT INTO hosts (host_id, hostname, os, kernel, arch, last_seen, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)",
		)
		.bind(hostId, hostname, "Ubuntu 24.04", "6.8.0", "x86_64", lastSeen, isActive)
		.run();
}

async function insertMetrics(
	db: D1Database,
	hostId: string,
	ts: number,
	cpuPct: number,
	memPct: number,
	uptime: number,
) {
	await db
		.prepare(
			`INSERT INTO metrics_raw (host_id, ts, cpu_usage_pct, mem_used_pct, uptime_seconds,
       cpu_load1, cpu_load5, cpu_load15, cpu_iowait, cpu_steal, cpu_count,
       mem_total, mem_available, swap_total, swap_used, swap_used_pct, disk_json, net_json)
     VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 4, 8000000000, 4000000000, 2000000000, 0, 0, '[]', '[]')`,
		)
		.bind(hostId, ts, cpuPct, memPct, uptime)
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
			"INSERT INTO alert_states (host_id, rule_id, severity, value, triggered_at, message) VALUES (?, ?, ?, 95.0, ?, 'test alert')",
		)
		.bind(hostId, ruleId, severity, triggeredAt)
		.run();
}

describe("GET /api/hosts", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(() => {
		db = createMockD1();
		app = createApp(db);
	});

	test("returns empty array when no hosts", async () => {
		const res = await get(app);
		expect(res.status).toBe(200);
		const body = (await res.json()) as HostOverviewItem[];
		expect(body).toEqual([]);
	});

	test("returns HostOverviewItem[] with correct fields", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", "server-1", now);
		await insertMetrics(db, "host-001", now, 25.5, 60.0, 86400);

		const res = await get(app);
		expect(res.status).toBe(200);
		const body = (await res.json()) as HostOverviewItem[];
		expect(body).toHaveLength(1);

		const item = body[0];
		expect(item.host_id).toBe("host-001");
		expect(item.hostname).toBe("server-1");
		expect(item.os).toBe("Ubuntu 24.04");
		expect(item.kernel).toBe("6.8.0");
		expect(item.arch).toBe("x86_64");
		expect(item.cpu_usage_pct).toBe(25.5);
		expect(item.mem_used_pct).toBe(60.0);
		expect(item.uptime_seconds).toBe(86400);
		expect(item.last_seen).toBe(now);
		expect(item.alert_count).toBe(0);
		expect(item.status).toBe("healthy");
	});

	test("status derivation: healthy (no alerts, recently seen)", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", "server-1", now);

		const res = await get(app);
		const body = (await res.json()) as HostOverviewItem[];
		expect(body[0].status).toBe("healthy");
	});

	test("status derivation: warning (warning alert active)", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", "server-1", now);
		await insertAlert(db, "host-001", "iowait_high", "warning", now);

		const res = await get(app);
		const body = (await res.json()) as HostOverviewItem[];
		expect(body[0].status).toBe("warning");
		expect(body[0].alert_count).toBe(1);
	});

	test("status derivation: critical (critical alert active)", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", "server-1", now);
		await insertAlert(db, "host-001", "disk_full", "critical", now);

		const res = await get(app);
		const body = (await res.json()) as HostOverviewItem[];
		expect(body[0].status).toBe("critical");
		expect(body[0].alert_count).toBe(1);
	});

	test("status derivation: offline (last_seen > 120s ago)", async () => {
		const now = Math.floor(Date.now() / 1000);
		const stale = now - 200; // 200s ago, exceeds 120s threshold
		await insertHost(db, "host-001", "server-1", stale);

		const res = await get(app);
		const body = (await res.json()) as HostOverviewItem[];
		expect(body[0].status).toBe("offline");
	});

	test("latest metrics merged correctly (picks newest)", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", "server-1", now);
		// Older metrics
		await insertMetrics(db, "host-001", now - 60, 10.0, 40.0, 86000);
		// Newer metrics — should be used
		await insertMetrics(db, "host-001", now, 55.5, 75.0, 86400);

		const res = await get(app);
		const body = (await res.json()) as HostOverviewItem[];
		expect(body[0].cpu_usage_pct).toBe(55.5);
		expect(body[0].mem_used_pct).toBe(75.0);
		expect(body[0].uptime_seconds).toBe(86400);
	});

	test("alert counts correct with multiple alerts", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", "server-1", now);
		await insertAlert(db, "host-001", "disk_full", "critical", now);
		await insertAlert(db, "host-001", "mem_high", "critical", now);
		await insertAlert(db, "host-001", "iowait_high", "warning", now);

		const res = await get(app);
		const body = (await res.json()) as HostOverviewItem[];
		expect(body[0].alert_count).toBe(3);
		expect(body[0].status).toBe("critical"); // critical takes priority over warning
	});

	test("retired hosts excluded (is_active = 0)", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", "active-host", now, 1);
		await insertHost(db, "host-002", "retired-host", now, 0);

		const res = await get(app);
		const body = (await res.json()) as HostOverviewItem[];
		expect(body).toHaveLength(1);
		expect(body[0].host_id).toBe("host-001");
	});

	test("host with no metrics returns null metric fields", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", "server-1", now);

		const res = await get(app);
		const body = (await res.json()) as HostOverviewItem[];
		expect(body[0].cpu_usage_pct).toBeNull();
		expect(body[0].mem_used_pct).toBeNull();
		expect(body[0].uptime_seconds).toBeNull();
	});
});
