import type { HostOverviewItem } from "@bat/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, test } from "vitest";
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

	test("returns cpu_model and boot_time when available", async () => {
		const now = Math.floor(Date.now() / 1000);
		const bootTime = now - 86400;
		await db
			.prepare(
				"INSERT INTO hosts (host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)",
			)
			.bind(
				"host-cpu",
				"cpu-host",
				"Ubuntu 24.04",
				"6.8.0",
				"x86_64",
				"AMD EPYC 7763",
				bootTime,
				now,
			)
			.run();

		const res = await get(app);
		const body = (await res.json()) as HostOverviewItem[];
		const item = body.find((h) => h.host_id === "host-cpu");
		expect(item?.cpu_model).toBe("AMD EPYC 7763");
		expect(item?.boot_time).toBe(bootTime);
	});

	test("cpu_model and boot_time are null when not set", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", "server-1", now);

		const res = await get(app);
		const body = (await res.json()) as HostOverviewItem[];
		expect(body[0].cpu_model).toBeNull();
		expect(body[0].boot_time).toBeNull();
	});

	test("malformed disk_json → disk_root_used_pct null (catch branch)", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-bad-disk", "bad-disk", now);
		await db
			.prepare(
				`INSERT INTO metrics_raw (host_id, ts, cpu_usage_pct, mem_used_pct, uptime_seconds,
       cpu_load1, cpu_load5, cpu_load15, cpu_iowait, cpu_steal, cpu_count,
       mem_total, mem_available, swap_total, swap_used, swap_used_pct, disk_json, net_json)
     VALUES (?, ?, 10, 20, 100, 0, 0, 0, 0, 0, 4, 1, 1, 1, 0, 0, '{not json', NULL)`,
			)
			.bind("host-bad-disk", now)
			.run();

		const res = await get(app);
		const body = (await res.json()) as HostOverviewItem[];
		const host = body.find((h) => h.host_id === "host-bad-disk");
		expect(host?.disk_root_used_pct).toBeNull();
	});

	test("malformed net_json → net rates null (catch branch)", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-bad-net", "bad-net", now);
		await db
			.prepare(
				`INSERT INTO metrics_raw (host_id, ts, cpu_usage_pct, mem_used_pct, uptime_seconds,
       cpu_load1, cpu_load5, cpu_load15, cpu_iowait, cpu_steal, cpu_count,
       mem_total, mem_available, swap_total, swap_used, swap_used_pct, disk_json, net_json)
     VALUES (?, ?, 10, 20, 100, 0, 0, 0, 0, 0, 4, 1, 1, 1, 0, 0, '[]', '{not json')`,
			)
			.bind("host-bad-net", now)
			.run();

		const res = await get(app);
		const body = (await res.json()) as HostOverviewItem[];
		const host = body.find((h) => h.host_id === "host-bad-net");
		expect(host?.net_rx_rate).toBeNull();
		expect(host?.net_tx_rate).toBeNull();
	});

	test("disk_root_used_pct extracted from root mount", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-disk", "disk-host", now);
		await db
			.prepare(
				`INSERT INTO metrics_raw (host_id, ts, cpu_usage_pct, mem_used_pct, uptime_seconds,
       cpu_load1, cpu_load5, cpu_load15, cpu_iowait, cpu_steal, cpu_count,
       mem_total, mem_available, swap_total, swap_used, swap_used_pct, disk_json, net_json)
     VALUES (?, ?, 10, 20, 100, 0, 0, 0, 0, 0, 4, 1, 1, 1, 0, 0, ?, ?)`,
			)
			.bind(
				"host-disk",
				now,
				JSON.stringify([
					{ mount: "/data", used_pct: 10 },
					{ mount: "/", used_pct: 77.5 },
				]),
				JSON.stringify([
					{ rx_bytes: 1000, tx_bytes: 500 },
					{ rx_bytes: 200, tx_bytes: 100 },
				]),
			)
			.run();

		const res = await get(app);
		const body = (await res.json()) as HostOverviewItem[];
		const host = body.find((h) => h.host_id === "host-disk");
		expect(host?.disk_root_used_pct).toBe(77.5);
		expect(host?.net_rx_rate).toBe(1200);
		expect(host?.net_tx_rate).toBe(600);
	});

	test("port allowlist suppresses public_port warning → status healthy", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-ports", "ports-host", now);
		// Per-host allowlist covers ports 22 and 443
		await db
			.prepare("INSERT INTO port_allowlist (host_id, port) VALUES (?, ?)")
			.bind("host-ports", 22)
			.run();
		await db
			.prepare("INSERT INTO port_allowlist (host_id, port) VALUES (?, ?)")
			.bind("host-ports", 443)
			.run();
		// Active public_port warning whose ports are all allowlisted
		await db
			.prepare(
				"INSERT INTO alert_states (host_id, rule_id, severity, value, triggered_at, message) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.bind("host-ports", "public_port", "warning", 2, now, "Unexpected public ports: 22, 443")
			.run();

		const res = await get(app);
		expect(res.status).toBe(200);
		const body = (await res.json()) as HostOverviewItem[];
		expect(body).toHaveLength(1);
		const host = body[0];
		expect(host.host_id).toBe("host-ports");
		// Alert is present in the DB, but status derivation suppresses it via allowlist
		expect(host.alert_count).toBe(1);
		expect(host.status).toBe("healthy");
	});

	test("port allowlist does NOT suppress public_port warning when message contains non-allowlisted port", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-ports2", "ports-host2", now);
		await db
			.prepare("INSERT INTO port_allowlist (host_id, port) VALUES (?, ?)")
			.bind("host-ports2", 22)
			.run();
		// 3306 is NOT on the allowlist → warning should stand
		await db
			.prepare(
				"INSERT INTO alert_states (host_id, rule_id, severity, value, triggered_at, message) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.bind("host-ports2", "public_port", "warning", 1, now, "Unexpected public ports: 3306")
			.run();

		const res = await get(app);
		const body = (await res.json()) as HostOverviewItem[];
		const host = body.find((h) => h.host_id === "host-ports2");
		expect(host?.status).toBe("warning");
	});

	test("sparkline data populated from metrics_hourly", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-spark", "spark-host", now);

		for (let i = 0; i < 3; i++) {
			await db
				.prepare(
					`INSERT INTO metrics_hourly
			     (host_id, hour_ts, sample_count, cpu_usage_avg, mem_used_pct_avg,
			      net_rx_bytes_avg, net_tx_bytes_avg)
			     VALUES (?, ?, 120, ?, ?, ?, ?)`,
				)
				.bind("host-spark", now - i * 3600, 10 + i, 20 + i, 1000 + i, 500 + i)
				.run();
		}

		const res = await get(app);
		const body = (await res.json()) as HostOverviewItem[];
		const host = body.find((h) => h.host_id === "host-spark");
		expect(host?.cpu_sparkline).not.toBeNull();
		expect(host?.cpu_sparkline?.length).toBe(3);
		expect(host?.mem_sparkline?.length).toBe(3);
		// net sparkline normalized to 0–100, at least one entry should equal 100
		expect(host?.net_sparkline?.length).toBe(3);
		const netMax = Math.max(...(host?.net_sparkline ?? []).map((p) => p.v));
		expect(netMax).toBe(100);
	});

	test("net sparkline all zeros → normalized to 0", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-zero-net", "zero-net", now);

		await db
			.prepare(
				`INSERT INTO metrics_hourly
		     (host_id, hour_ts, sample_count, cpu_usage_avg, mem_used_pct_avg,
		      net_rx_bytes_avg, net_tx_bytes_avg)
		     VALUES (?, ?, 120, 10, 20, 0, 0)`,
			)
			.bind("host-zero-net", now - 3600)
			.run();

		const res = await get(app);
		const body = (await res.json()) as HostOverviewItem[];
		const host = body.find((h) => h.host_id === "host-zero-net");
		expect(host?.net_sparkline?.[0]?.v).toBe(0);
	});
});
