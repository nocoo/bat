import { beforeEach, describe, expect, test } from "bun:test";
import type { MetricsPayload } from "@bat/shared";
import { Hono } from "hono";
import { createMockD1 } from "../test-helpers/mock-d1";
import type { AppEnv } from "../types";
import { ingestRoute } from "./ingest";

const WRITE_KEY = "test-write-key";

function makePayload(overrides?: Partial<MetricsPayload>): MetricsPayload {
	const now = Math.floor(Date.now() / 1000);
	return {
		host_id: "host-001",
		timestamp: now,
		interval: 30,
		cpu: {
			load1: 0.5,
			load5: 0.3,
			load15: 0.2,
			usage_pct: 12.5,
			iowait_pct: 1.2,
			steal_pct: 0.0,
			count: 4,
		},
		mem: {
			total_bytes: 8_000_000_000,
			available_bytes: 4_000_000_000,
			used_pct: 50.0,
		},
		swap: {
			total_bytes: 2_000_000_000,
			used_bytes: 100_000_000,
			used_pct: 5.0,
		},
		disk: [
			{
				mount: "/",
				total_bytes: 100_000_000_000,
				avail_bytes: 50_000_000_000,
				used_pct: 50.0,
			},
		],
		net: [
			{
				iface: "eth0",
				rx_bytes_rate: 1000,
				tx_bytes_rate: 500,
				rx_errors: 0,
				tx_errors: 0,
			},
		],
		uptime_seconds: 86400,
		...overrides,
	};
}

function createApp(db: D1Database) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.env = { DB: db, BAT_WRITE_KEY: WRITE_KEY, BAT_READ_KEY: "rk" };
		return next();
	});
	app.post("/api/ingest", ingestRoute);
	return app;
}

function post(app: Hono<AppEnv>, body: unknown) {
	return app.request(
		new Request("http://localhost/api/ingest", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

describe("POST /api/ingest", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(() => {
		db = createMockD1();
		app = createApp(db);
	});

	test("valid payload → 204, metrics inserted", async () => {
		const payload = makePayload();
		const res = await post(app, payload);
		expect(res.status).toBe(204);

		// Verify host was upserted
		const host = await db
			.prepare("SELECT * FROM hosts WHERE host_id = ?")
			.bind("host-001")
			.first<Record<string, unknown>>();
		expect(host).not.toBeNull();
		expect(host?.host_id).toBe("host-001");

		// Verify metrics were inserted
		const metrics = await db
			.prepare("SELECT * FROM metrics_raw WHERE host_id = ?")
			.bind("host-001")
			.first<Record<string, unknown>>();
		expect(metrics).not.toBeNull();
		expect(metrics?.cpu_load1).toBe(0.5);
		expect(metrics?.cpu_usage_pct).toBe(12.5);
		expect(metrics?.mem_total).toBe(8_000_000_000);
		expect(metrics?.mem_used_pct).toBe(50.0);
		expect(metrics?.swap_used_pct).toBe(5.0);
		expect(metrics?.uptime_seconds).toBe(86400);

		// Verify disk/net are JSON strings
		const diskJson = JSON.parse(metrics?.disk_json as string);
		expect(diskJson).toBeArray();
		expect(diskJson[0].mount).toBe("/");

		const netJson = JSON.parse(metrics?.net_json as string);
		expect(netJson).toBeArray();
		expect(netJson[0].iface).toBe("eth0");
	});

	test("invalid payload → 400", async () => {
		const res = await post(app, { host_id: "h1" });
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("Invalid");
	});

	test("clock skew → 400", async () => {
		const payload = makePayload({
			timestamp: Math.floor(Date.now() / 1000) - 600, // 10 minutes off
		});
		const res = await post(app, payload);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("Clock skew");
		expect(body.error).toContain("NTP");
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

	test("missing required fields → 400", async () => {
		const payload = makePayload();
		// Remove cpu field
		const broken = { ...payload, cpu: undefined };
		const res = await post(app, broken);
		expect(res.status).toBe(400);
	});

	test("missing nested required fields → 400", async () => {
		const payload = makePayload();
		// Remove mem.total_bytes
		const brokenMem = { ...payload, mem: { available_bytes: 1000, used_pct: 10 } };
		const res = await post(app, brokenMem);
		expect(res.status).toBe(400);
	});

	test("invalid JSON body → 400", async () => {
		const res = await app.request(
			new Request("http://localhost/api/ingest", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not json",
			}),
		);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("Invalid JSON");
	});

	test("host_id used as fallback hostname", async () => {
		const res = await post(app, makePayload());
		expect(res.status).toBe(204);

		const host = await db
			.prepare("SELECT hostname FROM hosts WHERE host_id = ?")
			.bind("host-001")
			.first<{ hostname: string }>();
		// host_id is used as fallback hostname since ingest doesn't carry hostname
		expect(host?.hostname).toBe("host-001");
	});

	test("last_seen uses Worker time, not Probe time", async () => {
		const beforeTs = Math.floor(Date.now() / 1000);
		await post(app, makePayload());
		const afterTs = Math.floor(Date.now() / 1000);

		const host = await db
			.prepare("SELECT last_seen FROM hosts WHERE host_id = ?")
			.bind("host-001")
			.first<{ last_seen: number }>();

		expect(host?.last_seen).toBeGreaterThanOrEqual(beforeTs);
		expect(host?.last_seen).toBeLessThanOrEqual(afterTs);
	});

	test("clock skew within threshold → accepted", async () => {
		// 4 minutes off is within 300s threshold
		const payload = makePayload({
			timestamp: Math.floor(Date.now() / 1000) - 240,
		});
		const res = await post(app, payload);
		expect(res.status).toBe(204);
	});

	test("ingest triggers alert state changes (disk_full)", async () => {
		const payload = makePayload();
		// Disk at 95% should trigger disk_full alert
		payload.disk = [
			{ mount: "/", total_bytes: 100_000_000_000, avail_bytes: 5_000_000_000, used_pct: 95 },
		];
		const res = await post(app, payload);
		expect(res.status).toBe(204);

		const alert = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind("host-001", "disk_full")
			.first<{ severity: string; value: number }>();
		expect(alert).not.toBeNull();
		expect(alert?.severity).toBe("critical");
		expect(alert?.value).toBe(95);
	});

	test("ingest clears alert when condition resolves", async () => {
		// First: trigger disk_full
		const now = Math.floor(Date.now() / 1000);
		const alertPayload = makePayload({ timestamp: now });
		alertPayload.disk = [
			{ mount: "/", total_bytes: 100_000_000_000, avail_bytes: 5_000_000_000, used_pct: 95 },
		];
		await post(app, alertPayload);

		// Verify alert exists
		const before = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind("host-001", "disk_full")
			.first();
		expect(before).not.toBeNull();

		// Then: condition clears with a new timestamp (different data point)
		await post(app, makePayload({ timestamp: now + 30 }));
		const after = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind("host-001", "disk_full")
			.first();
		expect(after).toBeNull();
	});

	test("duplicate ingest is fully idempotent (no side effects on retry)", async () => {
		const now = Math.floor(Date.now() / 1000);
		const payload = makePayload({ timestamp: now });
		payload.disk = [
			{ mount: "/", total_bytes: 100_000_000_000, avail_bytes: 5_000_000_000, used_pct: 95 },
		];

		// First ingest — triggers alert, sets last_seen
		await post(app, payload);

		const hostAfterFirst = await db
			.prepare("SELECT last_seen FROM hosts WHERE host_id = ?")
			.bind("host-001")
			.first<{ last_seen: number }>();
		const alertAfterFirst = await db
			.prepare("SELECT triggered_at FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind("host-001", "disk_full")
			.first<{ triggered_at: number }>();
		expect(hostAfterFirst).not.toBeNull();
		expect(alertAfterFirst).not.toBeNull();

		// Second ingest — same payload, should be a no-op
		await post(app, payload);

		const hostAfterSecond = await db
			.prepare("SELECT last_seen FROM hosts WHERE host_id = ?")
			.bind("host-001")
			.first<{ last_seen: number }>();
		const alertAfterSecond = await db
			.prepare("SELECT triggered_at FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind("host-001", "disk_full")
			.first<{ triggered_at: number }>();

		// last_seen and triggered_at must not have changed
		expect(hostAfterSecond?.last_seen).toBe(hostAfterFirst?.last_seen);
		expect(alertAfterSecond?.triggered_at).toBe(alertAfterFirst?.triggered_at);

		// Only one metrics row should exist
		const metricsCount = await db
			.prepare("SELECT COUNT(*) as cnt FROM metrics_raw WHERE host_id = ?")
			.bind("host-001")
			.first<{ cnt: number }>();
		expect(metricsCount?.cnt).toBe(1);
	});

	test("T3 fields stored when present", async () => {
		const payload = makePayload({
			psi: {
				cpu_some_avg10: 2.4,
				cpu_some_avg60: 2.13,
				cpu_some_avg300: 1.4,
				mem_some_avg10: 0,
				mem_some_avg60: 0,
				mem_some_avg300: 0,
				mem_full_avg10: 0,
				mem_full_avg60: 0,
				mem_full_avg300: 0,
				io_some_avg10: 0.5,
				io_some_avg60: 0.01,
				io_some_avg300: 0,
				io_full_avg10: 0.3,
				io_full_avg60: 0,
				io_full_avg300: 0,
			},
			disk_io: [
				{
					device: "sda",
					read_iops: 10,
					write_iops: 20,
					read_bytes_sec: 102400,
					write_bytes_sec: 204800,
					io_util_pct: 3.2,
				},
			],
			tcp: { established: 6, time_wait: 26, orphan: 0, allocated: 19 },
			fd: { allocated: 1344, max: 1048576 },
		});
		payload.cpu.context_switches_sec = 889.9;
		payload.cpu.forks_sec = 7.1;
		payload.cpu.procs_running = 1;
		payload.cpu.procs_blocked = 0;
		payload.mem.oom_kills_delta = 0;

		const res = await post(app, payload);
		expect(res.status).toBe(204);

		const row = await db
			.prepare("SELECT * FROM metrics_raw WHERE host_id = ?")
			.bind("host-001")
			.first<Record<string, unknown>>();

		// PSI
		expect(row?.psi_cpu_some_avg10).toBe(2.4);
		expect(row?.psi_cpu_some_avg60).toBe(2.13);
		expect(row?.psi_io_some_avg10).toBe(0.5);
		expect(row?.psi_io_full_avg10).toBe(0.3);

		// Disk I/O
		const diskIo = JSON.parse(row?.disk_io_json as string);
		expect(diskIo).toBeArray();
		expect(diskIo[0].device).toBe("sda");
		expect(diskIo[0].io_util_pct).toBe(3.2);

		// TCP
		expect(row?.tcp_established).toBe(6);
		expect(row?.tcp_time_wait).toBe(26);
		expect(row?.tcp_orphan).toBe(0);
		expect(row?.tcp_allocated).toBe(19);

		// CPU extensions
		expect(row?.context_switches_sec).toBe(889.9);
		expect(row?.forks_sec).toBe(7.1);
		expect(row?.procs_running).toBe(1);
		expect(row?.procs_blocked).toBe(0);

		// OOM kills
		expect(row?.oom_kills).toBe(0);

		// File descriptors
		expect(row?.fd_allocated).toBe(1344);
	});

	test("T3 fields null when absent (backward compat)", async () => {
		const res = await post(app, makePayload());
		expect(res.status).toBe(204);

		const row = await db
			.prepare("SELECT * FROM metrics_raw WHERE host_id = ?")
			.bind("host-001")
			.first<Record<string, unknown>>();

		expect(row?.psi_cpu_some_avg10).toBeNull();
		expect(row?.disk_io_json).toBeNull();
		expect(row?.tcp_established).toBeNull();
		expect(row?.context_switches_sec).toBeNull();
		expect(row?.oom_kills).toBeNull();
		expect(row?.fd_allocated).toBeNull();
	});
});
