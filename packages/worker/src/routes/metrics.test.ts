import { beforeEach, describe, expect, test } from "bun:test";
import type { MetricsQueryResponse } from "@bat/shared";
import { Hono } from "hono";
import { createMockD1 } from "../test-helpers/mock-d1";
import type { AppEnv } from "../types";
import { hostMetricsRoute } from "./metrics";

const READ_KEY = "test-read-key";

function createApp(db: D1Database) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.env = { DB: db, BAT_WRITE_KEY: "wk", BAT_READ_KEY: READ_KEY };
		return next();
	});
	app.get("/api/hosts/:id/metrics", hostMetricsRoute);
	return app;
}

function get(app: Hono<AppEnv>, hostId: string, from?: number, to?: number) {
	const params = new URLSearchParams();
	if (from !== undefined) params.set("from", String(from));
	if (to !== undefined) params.set("to", String(to));
	const qs = params.toString();
	const url = `http://localhost/api/hosts/${hostId}/metrics${qs ? `?${qs}` : ""}`;
	return app.request(new Request(url));
}

async function insertHost(db: D1Database, hostId: string, lastSeen: number) {
	await db
		.prepare("INSERT INTO hosts (host_id, hostname, last_seen) VALUES (?, ?, ?)")
		.bind(hostId, hostId, lastSeen)
		.run();
}

async function insertRawMetrics(
	db: D1Database,
	hostId: string,
	ts: number,
	cpuPct: number,
	memPct: number,
) {
	await db
		.prepare(
			`INSERT INTO metrics_raw (host_id, ts, cpu_usage_pct, mem_used_pct, uptime_seconds,
       cpu_load1, cpu_load5, cpu_load15, cpu_iowait, cpu_steal, cpu_count,
       mem_total, mem_available, swap_total, swap_used, swap_used_pct, disk_json, net_json)
     VALUES (?, ?, ?, ?, 86400, 0.5, 0.3, 0.2, 1.0, 0.0, 4, 8000000000, 4000000000, 2000000000, 0, 0, '[]', '[]')`,
		)
		.bind(hostId, ts, cpuPct, memPct)
		.run();
}

interface HourlyT3Options {
	psi_cpu_some_avg10_avg?: number | null;
	psi_cpu_some_avg60_avg?: number | null;
	psi_mem_some_avg60_avg?: number | null;
	psi_mem_full_avg60_avg?: number | null;
	psi_io_some_avg60_avg?: number | null;
	psi_io_full_avg60_avg?: number | null;
	disk_io_json?: string | null;
	tcp_established_avg?: number | null;
	tcp_time_wait_avg?: number | null;
	tcp_orphan_avg?: number | null;
	tcp_allocated_avg?: number | null;
	context_switches_sec_avg?: number | null;
	forks_sec_avg?: number | null;
	procs_running_avg?: number | null;
	procs_blocked_avg?: number | null;
	oom_kills_sum?: number | null;
	fd_allocated_avg?: number | null;
	fd_max?: number | null;
}

async function insertHourlyMetrics(
	db: D1Database,
	hostId: string,
	hourTs: number,
	cpuAvg: number,
	memAvg: number,
	t3?: HourlyT3Options,
) {
	await db
		.prepare(
			`INSERT INTO metrics_hourly (host_id, hour_ts, sample_count, cpu_usage_avg, cpu_usage_max,
       cpu_iowait_avg, cpu_steal_avg, cpu_load1_avg, cpu_load5_avg, cpu_load15_avg,
       mem_total, mem_available_min, mem_used_pct_avg, mem_used_pct_max,
       swap_total, swap_used_max, swap_used_pct_avg, swap_used_pct_max,
       uptime_min, disk_json, net_rx_bytes_avg, net_rx_bytes_max, net_tx_bytes_avg, net_tx_bytes_max,
       net_rx_errors, net_tx_errors,
       psi_cpu_some_avg10_avg, psi_cpu_some_avg60_avg,
       psi_mem_some_avg60_avg, psi_mem_full_avg60_avg,
       psi_io_some_avg60_avg, psi_io_full_avg60_avg,
       disk_io_json,
       tcp_established_avg, tcp_time_wait_avg, tcp_orphan_avg, tcp_allocated_avg,
       context_switches_sec_avg, forks_sec_avg, procs_running_avg, procs_blocked_avg,
       oom_kills_sum, fd_allocated_avg, fd_max)
     VALUES (?, ?, 120, ?, ?, 1.0, 0.0, 0.5, 0.3, 0.2,
       8000000000, 3500000000, ?, ?,
       2000000000, 100000000, 5.0, 8.0,
       86000, '[]', 1000, 5000, 500, 2000, 0, 0,
       ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			hostId,
			hourTs,
			cpuAvg,
			cpuAvg + 10,
			memAvg,
			memAvg + 5,
			t3?.psi_cpu_some_avg10_avg ?? null,
			t3?.psi_cpu_some_avg60_avg ?? null,
			t3?.psi_mem_some_avg60_avg ?? null,
			t3?.psi_mem_full_avg60_avg ?? null,
			t3?.psi_io_some_avg60_avg ?? null,
			t3?.psi_io_full_avg60_avg ?? null,
			t3?.disk_io_json ?? null,
			t3?.tcp_established_avg ?? null,
			t3?.tcp_time_wait_avg ?? null,
			t3?.tcp_orphan_avg ?? null,
			t3?.tcp_allocated_avg ?? null,
			t3?.context_switches_sec_avg ?? null,
			t3?.forks_sec_avg ?? null,
			t3?.procs_running_avg ?? null,
			t3?.procs_blocked_avg ?? null,
			t3?.oom_kills_sum ?? null,
			t3?.fd_allocated_avg ?? null,
			t3?.fd_max ?? null,
		)
		.run();
}

describe("GET /api/hosts/:id/metrics", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(() => {
		db = createMockD1();
		app = createApp(db);
	});

	test("returns raw metrics for <= 24h range", async () => {
		const now = Math.floor(Date.now() / 1000);
		const from = now - 3600; // 1 hour ago
		await insertHost(db, "host-001", now);
		await insertRawMetrics(db, "host-001", now - 1800, 25.0, 50.0);
		await insertRawMetrics(db, "host-001", now - 900, 30.0, 55.0);

		const res = await get(app, "host-001", from, now);
		expect(res.status).toBe(200);
		const body = (await res.json()) as MetricsQueryResponse;
		expect(body.resolution).toBe("raw");
		expect(body.host_id).toBe("host-001");
		expect(body.from).toBe(from);
		expect(body.to).toBe(now);
		expect(body.data).toHaveLength(2);
		expect(body.data[0].cpu_usage_pct).toBe(25.0);
		expect(body.data[1].cpu_usage_pct).toBe(30.0);
	});

	test("returns hourly metrics for > 24h range", async () => {
		const now = Math.floor(Date.now() / 1000);
		const from = now - 172800; // 48h ago
		const hourTs = now - 3600;
		await insertHost(db, "host-001", now);
		await insertHourlyMetrics(db, "host-001", hourTs, 20.0, 45.0);

		const res = await get(app, "host-001", from, now);
		expect(res.status).toBe(200);
		const body = (await res.json()) as MetricsQueryResponse;
		expect(body.resolution).toBe("hourly");
		expect(body.data).toHaveLength(1);
		expect(body.data[0].ts).toBe(hourTs);
		expect(body.data[0].cpu_usage_pct).toBe(20.0);
		expect(body.data[0].sample_count).toBe(120);
	});

	test("hourly query returns T3 fields from metrics_hourly", async () => {
		const now = Math.floor(Date.now() / 1000);
		const from = now - 172800; // 48h ago
		const hourTs = now - 3600;
		await insertHost(db, "host-001", now);
		await insertHourlyMetrics(db, "host-001", hourTs, 20.0, 45.0, {
			psi_cpu_some_avg10_avg: 5.5,
			psi_cpu_some_avg60_avg: 8.2,
			psi_mem_some_avg60_avg: 12.0,
			psi_mem_full_avg60_avg: 3.1,
			psi_io_some_avg60_avg: 7.7,
			psi_io_full_avg60_avg: 2.5,
			disk_io_json:
				'[{"device":"sda","read_iops_avg":100,"write_iops_avg":200,"read_bytes_sec_avg":1000,"write_bytes_sec_avg":2000,"io_util_pct_avg":15.0,"io_util_pct_max":22.0}]',
			tcp_established_avg: 150,
			tcp_time_wait_avg: 25,
			tcp_orphan_avg: 2,
			tcp_allocated_avg: 200,
			context_switches_sec_avg: 5000,
			forks_sec_avg: 120,
			procs_running_avg: 3,
			procs_blocked_avg: 1,
			oom_kills_sum: 2,
			fd_allocated_avg: 8000,
			fd_max: 65535,
		});

		const res = await get(app, "host-001", from, now);
		expect(res.status).toBe(200);
		const body = (await res.json()) as MetricsQueryResponse;
		expect(body.resolution).toBe("hourly");
		expect(body.data).toHaveLength(1);
		const d = body.data[0];

		// PSI fields
		expect(d.psi_cpu_some_avg10).toBe(5.5);
		expect(d.psi_cpu_some_avg60).toBe(8.2);
		expect(d.psi_cpu_some_avg300).toBeNull(); // not stored in hourly
		expect(d.psi_mem_some_avg60).toBe(12.0);
		expect(d.psi_mem_full_avg60).toBe(3.1);
		expect(d.psi_io_some_avg60).toBe(7.7);
		expect(d.psi_io_full_avg60).toBe(2.5);

		// Disk I/O (hourly uses aggregated field names)
		expect(d.disk_io_json).toBe(
			'[{"device":"sda","read_iops_avg":100,"write_iops_avg":200,"read_bytes_sec_avg":1000,"write_bytes_sec_avg":2000,"io_util_pct_avg":15.0,"io_util_pct_max":22.0}]',
		);

		// TCP
		expect(d.tcp_established).toBe(150);
		expect(d.tcp_time_wait).toBe(25);
		expect(d.tcp_orphan).toBe(2);
		expect(d.tcp_allocated).toBe(200);

		// CPU extensions
		expect(d.context_switches_sec).toBe(5000);
		expect(d.forks_sec).toBe(120);
		expect(d.procs_running).toBe(3);
		expect(d.procs_blocked).toBe(1);

		// OOM + FD
		expect(d.oom_kills).toBe(2);
		expect(d.fd_allocated).toBe(8000);
		expect(d.fd_max).toBe(65535);
	});

	test("hourly query returns null T3 fields when not populated", async () => {
		const now = Math.floor(Date.now() / 1000);
		const from = now - 172800;
		const hourTs = now - 3600;
		await insertHost(db, "host-001", now);
		// Insert without T3 options — all T3 columns default to null
		await insertHourlyMetrics(db, "host-001", hourTs, 20.0, 45.0);

		const res = await get(app, "host-001", from, now);
		const body = (await res.json()) as MetricsQueryResponse;
		const d = body.data[0];

		expect(d.psi_cpu_some_avg10).toBeNull();
		expect(d.psi_cpu_some_avg60).toBeNull();
		expect(d.tcp_established).toBeNull();
		expect(d.context_switches_sec).toBeNull();
		expect(d.oom_kills).toBeNull();
		expect(d.fd_allocated).toBeNull();
		expect(d.fd_max).toBeNull();
		expect(d.disk_io_json).toBeNull();
	});

	test("returns correct resolution field", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", now);

		// Exactly 24h → raw
		const res1 = await get(app, "host-001", now - 86400, now);
		const body1 = (await res1.json()) as MetricsQueryResponse;
		expect(body1.resolution).toBe("raw");

		// 24h + 1s → hourly
		const res2 = await get(app, "host-001", now - 86401, now);
		const body2 = (await res2.json()) as MetricsQueryResponse;
		expect(body2.resolution).toBe("hourly");
	});

	test("missing from/to → 400", async () => {
		const res1 = await get(app, "host-001");
		expect(res1.status).toBe(400);
		const body1 = (await res1.json()) as { error: string };
		expect(body1.error).toContain("Missing");

		// Only from provided
		const now = Math.floor(Date.now() / 1000);
		const res2 = await get(app, "host-001", now, undefined);
		expect(res2.status).toBe(400);
	});

	test("host not found → empty data", async () => {
		const now = Math.floor(Date.now() / 1000);
		const res = await get(app, "nonexistent", now - 3600, now);
		expect(res.status).toBe(200);
		const body = (await res.json()) as MetricsQueryResponse;
		expect(body.data).toEqual([]);
		expect(body.host_id).toBe("nonexistent");
	});

	test("data ordered by timestamp ASC", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", now);
		await insertRawMetrics(db, "host-001", now - 300, 10.0, 30.0);
		await insertRawMetrics(db, "host-001", now - 600, 20.0, 40.0);
		await insertRawMetrics(db, "host-001", now - 100, 5.0, 25.0);

		const res = await get(app, "host-001", now - 700, now);
		const body = (await res.json()) as MetricsQueryResponse;
		expect(body.data).toHaveLength(3);
		expect(body.data[0].ts).toBe(now - 600);
		expect(body.data[1].ts).toBe(now - 300);
		expect(body.data[2].ts).toBe(now - 100);
	});
});
