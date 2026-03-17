import { beforeEach, describe, expect, test } from "bun:test";
import { RETENTION } from "@bat/shared";
import { createMockD1 } from "../test-helpers/mock-d1";
import { aggregateHour, purgeOldData } from "./aggregation";

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
	opts: {
		cpuPct?: number;
		cpuIowait?: number;
		cpuSteal?: number;
		cpuLoad1?: number;
		memPct?: number;
		memTotal?: number;
		memAvailable?: number;
		swapTotal?: number;
		swapUsed?: number;
		swapUsedPct?: number;
		uptime?: number;
		netJson?: string;
		// T3 fields
		psiCpuAvg10?: number | null;
		psiCpuAvg60?: number | null;
		psiMemAvg60?: number | null;
		psiMemFullAvg60?: number | null;
		psiIoAvg60?: number | null;
		psiIoFullAvg60?: number | null;
		diskIoJson?: string | null;
		tcpEstablished?: number | null;
		tcpTimeWait?: number | null;
		tcpOrphan?: number | null;
		tcpAllocated?: number | null;
		ctxSwitchesSec?: number | null;
		forksSec?: number | null;
		procsRunning?: number | null;
		procsBlocked?: number | null;
		oomKills?: number | null;
		fdAllocated?: number | null;
		fdMax?: number | null;
	} = {},
) {
	const {
		cpuPct = 20,
		cpuIowait = 1,
		cpuSteal = 0,
		cpuLoad1 = 0.5,
		memPct = 50,
		memTotal = 8_000_000_000,
		memAvailable = 4_000_000_000,
		swapTotal = 2_000_000_000,
		swapUsed = 100_000_000,
		swapUsedPct = 5,
		uptime = 86400,
		netJson = '[{"iface":"eth0","rx_bytes_rate":1000,"tx_bytes_rate":500,"rx_errors":0,"tx_errors":0}]',
		psiCpuAvg10 = null,
		psiCpuAvg60 = null,
		psiMemAvg60 = null,
		psiMemFullAvg60 = null,
		psiIoAvg60 = null,
		psiIoFullAvg60 = null,
		diskIoJson = null,
		tcpEstablished = null,
		tcpTimeWait = null,
		tcpOrphan = null,
		tcpAllocated = null,
		ctxSwitchesSec = null,
		forksSec = null,
		procsRunning = null,
		procsBlocked = null,
		oomKills = null,
		fdAllocated = null,
		fdMax = null,
	} = opts;

	await db
		.prepare(
			`INSERT INTO metrics_raw (host_id, ts, cpu_usage_pct, cpu_iowait, cpu_steal,
       cpu_load1, cpu_load5, cpu_load15, cpu_count,
       mem_total, mem_available, mem_used_pct,
       swap_total, swap_used, swap_used_pct,
       disk_json, net_json, uptime_seconds,
       psi_cpu_some_avg10, psi_cpu_some_avg60,
       psi_mem_some_avg60, psi_mem_full_avg60,
       psi_io_some_avg60, psi_io_full_avg60,
       disk_io_json,
       tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated,
       context_switches_sec, forks_sec, procs_running, procs_blocked,
       oom_kills, fd_allocated, fd_max)
     VALUES (?, ?, ?, ?, ?, ?, 0.3, 0.2, 4, ?, ?, ?, ?, ?, ?, '[]', ?, ?,
             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			hostId,
			ts,
			cpuPct,
			cpuIowait,
			cpuSteal,
			cpuLoad1,
			memTotal,
			memAvailable,
			memPct,
			swapTotal,
			swapUsed,
			swapUsedPct,
			netJson,
			uptime,
			psiCpuAvg10,
			psiCpuAvg60,
			psiMemAvg60,
			psiMemFullAvg60,
			psiIoAvg60,
			psiIoFullAvg60,
			diskIoJson,
			tcpEstablished,
			tcpTimeWait,
			tcpOrphan,
			tcpAllocated,
			ctxSwitchesSec,
			forksSec,
			procsRunning,
			procsBlocked,
			oomKills,
			fdAllocated,
			fdMax,
		)
		.run();
}

describe("aggregateHour", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	test("computes correct avg/max/min", async () => {
		const hourTs = 1700000000;
		await insertHost(db, "host-001", hourTs + 1800);

		// Insert 3 samples within the hour
		await insertRawMetrics(db, "host-001", hourTs + 100, {
			cpuPct: 10,
			memPct: 40,
			memAvailable: 4_800_000_000,
			uptime: 86000,
		});
		await insertRawMetrics(db, "host-001", hourTs + 200, {
			cpuPct: 30,
			memPct: 60,
			memAvailable: 3_200_000_000,
			uptime: 86100,
		});
		await insertRawMetrics(db, "host-001", hourTs + 300, {
			cpuPct: 20,
			memPct: 50,
			memAvailable: 4_000_000_000,
			uptime: 86200,
		});

		await aggregateHour(db, hourTs);

		const row = await db
			.prepare("SELECT * FROM metrics_hourly WHERE host_id = ? AND hour_ts = ?")
			.bind("host-001", hourTs)
			.first<Record<string, unknown>>();

		expect(row).not.toBeNull();
		// AVG(10, 30, 20) = 20
		expect(row?.cpu_usage_avg).toBe(20);
		// MAX(10, 30, 20) = 30
		expect(row?.cpu_usage_max).toBe(30);
		// AVG(40, 60, 50) = 50
		expect(row?.mem_used_pct_avg).toBe(50);
		// MAX(40, 60, 50) = 60
		expect(row?.mem_used_pct_max).toBe(60);
		// MIN(4.8B, 3.2B, 4.0B) = 3.2B
		expect(row?.mem_available_min).toBe(3_200_000_000);
		// MIN uptime = 86000
		expect(row?.uptime_min).toBe(86000);
	});

	test("sample count is correct", async () => {
		const hourTs = 1700000000;
		await insertHost(db, "host-001", hourTs + 1800);

		await insertRawMetrics(db, "host-001", hourTs + 100);
		await insertRawMetrics(db, "host-001", hourTs + 200);
		await insertRawMetrics(db, "host-001", hourTs + 300);
		await insertRawMetrics(db, "host-001", hourTs + 400);
		await insertRawMetrics(db, "host-001", hourTs + 500);

		await aggregateHour(db, hourTs);

		const row = await db
			.prepare("SELECT sample_count FROM metrics_hourly WHERE host_id = ? AND hour_ts = ?")
			.bind("host-001", hourTs)
			.first<{ sample_count: number }>();

		expect(row?.sample_count).toBe(5);
	});

	test("network aggregation sums across interfaces per sample", async () => {
		const hourTs = 1700000000;
		await insertHost(db, "host-001", hourTs + 1800);

		const net1 = JSON.stringify([
			{ iface: "eth0", rx_bytes_rate: 1000, tx_bytes_rate: 500, rx_errors: 1, tx_errors: 0 },
			{ iface: "eth1", rx_bytes_rate: 2000, tx_bytes_rate: 1000, rx_errors: 0, tx_errors: 1 },
		]);
		const net2 = JSON.stringify([
			{ iface: "eth0", rx_bytes_rate: 3000, tx_bytes_rate: 1500, rx_errors: 0, tx_errors: 0 },
			{ iface: "eth1", rx_bytes_rate: 4000, tx_bytes_rate: 2000, rx_errors: 2, tx_errors: 0 },
		]);

		await insertRawMetrics(db, "host-001", hourTs + 100, { netJson: net1 });
		await insertRawMetrics(db, "host-001", hourTs + 200, { netJson: net2 });

		await aggregateHour(db, hourTs);

		const row = await db
			.prepare("SELECT * FROM metrics_hourly WHERE host_id = ? AND hour_ts = ?")
			.bind("host-001", hourTs)
			.first<Record<string, unknown>>();

		// Sample 1: rx=1000+2000=3000, tx=500+1000=1500
		// Sample 2: rx=3000+4000=7000, tx=1500+2000=3500
		// avg rx = (3000+7000)/2 = 5000, max rx = 7000
		// avg tx = (1500+3500)/2 = 2500, max tx = 3500
		expect(row?.net_rx_bytes_avg).toBe(5000);
		expect(row?.net_rx_bytes_max).toBe(7000);
		expect(row?.net_tx_bytes_avg).toBe(2500);
		expect(row?.net_tx_bytes_max).toBe(3500);
		// errors: 1+0+0+2=3 rx, 0+1+0+0=1 tx
		expect(row?.net_rx_errors).toBe(3);
		expect(row?.net_tx_errors).toBe(1);
	});

	test("idempotent (ON CONFLICT DO UPDATE)", async () => {
		const hourTs = 1700000000;
		await insertHost(db, "host-001", hourTs + 1800);

		await insertRawMetrics(db, "host-001", hourTs + 100, { cpuPct: 10 });
		await insertRawMetrics(db, "host-001", hourTs + 200, { cpuPct: 30 });

		// First aggregation
		await aggregateHour(db, hourTs);
		const first = await db
			.prepare(
				"SELECT cpu_usage_avg, sample_count FROM metrics_hourly WHERE host_id = ? AND hour_ts = ?",
			)
			.bind("host-001", hourTs)
			.first<{ cpu_usage_avg: number; sample_count: number }>();
		expect(first?.cpu_usage_avg).toBe(20);
		expect(first?.sample_count).toBe(2);

		// Add another sample and re-aggregate
		await insertRawMetrics(db, "host-001", hourTs + 300, { cpuPct: 50 });
		await aggregateHour(db, hourTs);

		const second = await db
			.prepare(
				"SELECT cpu_usage_avg, sample_count FROM metrics_hourly WHERE host_id = ? AND hour_ts = ?",
			)
			.bind("host-001", hourTs)
			.first<{ cpu_usage_avg: number; sample_count: number }>();
		// AVG(10, 30, 50) = 30
		expect(second?.cpu_usage_avg).toBe(30);
		expect(second?.sample_count).toBe(3);

		// Still only 1 row
		const count = await db
			.prepare("SELECT COUNT(*) as cnt FROM metrics_hourly WHERE host_id = ? AND hour_ts = ?")
			.bind("host-001", hourTs)
			.first<{ cnt: number }>();
		expect(count?.cnt).toBe(1);
	});

	test("skips inactive hosts", async () => {
		const hourTs = 1700000000;
		await db
			.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, 0)")
			.bind("host-retired", "retired", hourTs)
			.run();
		await insertRawMetrics(db, "host-retired", hourTs + 100);

		await aggregateHour(db, hourTs);

		const row = await db
			.prepare("SELECT * FROM metrics_hourly WHERE host_id = ?")
			.bind("host-retired")
			.first();
		expect(row).toBeNull();
	});

	test("handles multiple hosts in same hour", async () => {
		const hourTs = 1700000000;
		await insertHost(db, "host-001", hourTs + 1800);
		await insertHost(db, "host-002", hourTs + 1800);

		await insertRawMetrics(db, "host-001", hourTs + 100, { cpuPct: 10 });
		await insertRawMetrics(db, "host-002", hourTs + 100, { cpuPct: 40 });

		await aggregateHour(db, hourTs);

		const results = await db
			.prepare(
				"SELECT host_id, cpu_usage_avg FROM metrics_hourly WHERE hour_ts = ? ORDER BY host_id",
			)
			.bind(hourTs)
			.all<{ host_id: string; cpu_usage_avg: number }>();

		expect(results.results).toHaveLength(2);
		expect(results.results[0].host_id).toBe("host-001");
		expect(results.results[0].cpu_usage_avg).toBe(10);
		expect(results.results[1].host_id).toBe("host-002");
		expect(results.results[1].cpu_usage_avg).toBe(40);
	});

	test("T3 PSI fields aggregated as avg/max", async () => {
		const hourTs = 1700000000;
		await insertHost(db, "host-001", hourTs + 1800);

		await insertRawMetrics(db, "host-001", hourTs + 100, {
			psiCpuAvg60: 10,
			psiIoAvg60: 5,
			psiMemAvg60: 2,
		});
		await insertRawMetrics(db, "host-001", hourTs + 200, {
			psiCpuAvg60: 30,
			psiIoAvg60: 15,
			psiMemAvg60: 8,
		});

		await aggregateHour(db, hourTs);

		const row = await db
			.prepare("SELECT * FROM metrics_hourly WHERE host_id = ? AND hour_ts = ?")
			.bind("host-001", hourTs)
			.first<Record<string, unknown>>();

		expect(row?.psi_cpu_some_avg60_avg).toBe(20); // avg(10, 30)
		expect(row?.psi_cpu_some_avg60_max).toBe(30); // max(10, 30)
		expect(row?.psi_io_some_avg60_avg).toBe(10); // avg(5, 15)
		expect(row?.psi_io_some_avg60_max).toBe(15);
		expect(row?.psi_mem_some_avg60_avg).toBe(5); // avg(2, 8)
		expect(row?.psi_mem_some_avg60_max).toBe(8);
	});

	test("T3 disk_io_json aggregated per device with avg/max", async () => {
		const hourTs = 1700000000;
		await insertHost(db, "host-001", hourTs + 1800);

		await insertRawMetrics(db, "host-001", hourTs + 100, {
			diskIoJson: JSON.stringify([
				{
					device: "sda",
					read_iops: 100,
					write_iops: 200,
					read_bytes_sec: 50000,
					write_bytes_sec: 100000,
					io_util_pct: 20,
				},
				{
					device: "sdb",
					read_iops: 10,
					write_iops: 20,
					read_bytes_sec: 5000,
					write_bytes_sec: 10000,
					io_util_pct: 5,
				},
			]),
		});
		await insertRawMetrics(db, "host-001", hourTs + 200, {
			diskIoJson: JSON.stringify([
				{
					device: "sda",
					read_iops: 200,
					write_iops: 400,
					read_bytes_sec: 70000,
					write_bytes_sec: 140000,
					io_util_pct: 40,
				},
				{
					device: "sdb",
					read_iops: 30,
					write_iops: 60,
					read_bytes_sec: 15000,
					write_bytes_sec: 30000,
					io_util_pct: 15,
				},
			]),
		});

		await aggregateHour(db, hourTs);

		const row = await db
			.prepare("SELECT disk_io_json FROM metrics_hourly WHERE host_id = ? AND hour_ts = ?")
			.bind("host-001", hourTs)
			.first<{ disk_io_json: string }>();

		expect(row).not.toBeNull();
		const diskIo = JSON.parse(row?.disk_io_json);
		expect(diskIo).toHaveLength(2);

		const sda = diskIo.find((d: { device: string }) => d.device === "sda");
		expect(sda.read_iops_avg).toBe(150); // avg(100, 200)
		expect(sda.write_iops_avg).toBe(300); // avg(200, 400)
		expect(sda.read_bytes_sec_avg).toBe(60000); // avg(50000, 70000)
		expect(sda.write_bytes_sec_avg).toBe(120000); // avg(100000, 140000)
		expect(sda.io_util_pct_avg).toBe(30); // avg(20, 40)
		expect(sda.io_util_pct_max).toBe(40); // max(20, 40)

		const sdb = diskIo.find((d: { device: string }) => d.device === "sdb");
		expect(sdb.read_iops_avg).toBe(20); // avg(10, 30)
		expect(sdb.io_util_pct_max).toBe(15); // max(5, 15)
	});

	test("T3 disk_io_json null when all samples lack disk I/O", async () => {
		const hourTs = 1700000000;
		await insertHost(db, "host-001", hourTs + 1800);

		await insertRawMetrics(db, "host-001", hourTs + 100);
		await insertRawMetrics(db, "host-001", hourTs + 200);

		await aggregateHour(db, hourTs);

		const row = await db
			.prepare("SELECT disk_io_json FROM metrics_hourly WHERE host_id = ? AND hour_ts = ?")
			.bind("host-001", hourTs)
			.first<{ disk_io_json: string | null }>();

		expect(row?.disk_io_json).toBeNull();
	});

	test("T3 TCP fields aggregated as avg/max", async () => {
		const hourTs = 1700000000;
		await insertHost(db, "host-001", hourTs + 1800);

		await insertRawMetrics(db, "host-001", hourTs + 100, {
			tcpEstablished: 10,
			tcpTimeWait: 50,
			tcpOrphan: 0,
			tcpAllocated: 20,
		});
		await insertRawMetrics(db, "host-001", hourTs + 200, {
			tcpEstablished: 20,
			tcpTimeWait: 100,
			tcpOrphan: 2,
			tcpAllocated: 30,
		});

		await aggregateHour(db, hourTs);

		const row = await db
			.prepare("SELECT * FROM metrics_hourly WHERE host_id = ? AND hour_ts = ?")
			.bind("host-001", hourTs)
			.first<Record<string, unknown>>();

		expect(row?.tcp_established_avg).toBe(15);
		expect(row?.tcp_established_max).toBe(20);
		expect(row?.tcp_time_wait_avg).toBe(75);
		expect(row?.tcp_time_wait_max).toBe(100);
		expect(row?.tcp_orphan_avg).toBe(1);
		expect(row?.tcp_orphan_max).toBe(2);
	});

	test("T3 CPU extensions and OOM aggregated correctly", async () => {
		const hourTs = 1700000000;
		await insertHost(db, "host-001", hourTs + 1800);

		await insertRawMetrics(db, "host-001", hourTs + 100, {
			ctxSwitchesSec: 500,
			forksSec: 5,
			procsRunning: 1,
			procsBlocked: 0,
			oomKills: 0,
		});
		await insertRawMetrics(db, "host-001", hourTs + 200, {
			ctxSwitchesSec: 1000,
			forksSec: 15,
			procsRunning: 3,
			procsBlocked: 1,
			oomKills: 2,
		});

		await aggregateHour(db, hourTs);

		const row = await db
			.prepare("SELECT * FROM metrics_hourly WHERE host_id = ? AND hour_ts = ?")
			.bind("host-001", hourTs)
			.first<Record<string, unknown>>();

		expect(row?.context_switches_sec_avg).toBe(750);
		expect(row?.context_switches_sec_max).toBe(1000);
		expect(row?.forks_sec_avg).toBe(10);
		expect(row?.forks_sec_max).toBe(15);
		expect(row?.procs_running_avg).toBe(2);
		expect(row?.procs_running_max).toBe(3);
		expect(row?.oom_kills_sum).toBe(2); // sum(0, 2)
	});

	test("T3 FD fields aggregated as avg/max/last", async () => {
		const hourTs = 1700000000;
		await insertHost(db, "host-001", hourTs + 1800);

		await insertRawMetrics(db, "host-001", hourTs + 100, {
			fdAllocated: 1000,
			fdMax: 1048576,
		});
		await insertRawMetrics(db, "host-001", hourTs + 200, {
			fdAllocated: 1200,
			fdMax: 1048576,
		});

		await aggregateHour(db, hourTs);

		const row = await db
			.prepare("SELECT * FROM metrics_hourly WHERE host_id = ? AND hour_ts = ?")
			.bind("host-001", hourTs)
			.first<Record<string, unknown>>();

		expect(row?.fd_allocated_avg).toBe(1100);
		expect(row?.fd_allocated_max).toBe(1200);
		expect(row?.fd_max).toBe(1048576); // last value
	});

	test("T3 fields null when absent (backward compat)", async () => {
		const hourTs = 1700000000;
		await insertHost(db, "host-001", hourTs + 1800);

		// Insert without T3 fields
		await insertRawMetrics(db, "host-001", hourTs + 100);

		await aggregateHour(db, hourTs);

		const row = await db
			.prepare("SELECT * FROM metrics_hourly WHERE host_id = ? AND hour_ts = ?")
			.bind("host-001", hourTs)
			.first<Record<string, unknown>>();

		expect(row?.psi_cpu_some_avg60_avg).toBeNull();
		expect(row?.psi_cpu_some_avg60_max).toBeNull();
		expect(row?.tcp_established_avg).toBeNull();
		expect(row?.context_switches_sec_avg).toBeNull();
		expect(row?.oom_kills_sum).toBeNull();
		expect(row?.fd_allocated_avg).toBeNull();
	});
});

describe("purgeOldData", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	test("removes raw data older than 7 days", async () => {
		const now = 1700000000;
		await insertHost(db, "host-001", now);

		// Old data (8 days ago)
		const oldTs = now - 8 * 86400;
		await insertRawMetrics(db, "host-001", oldTs);
		// Recent data (1 day ago)
		const recentTs = now - 1 * 86400;
		await insertRawMetrics(db, "host-001", recentTs);

		await purgeOldData(db, now);

		const remaining = await db
			.prepare("SELECT ts FROM metrics_raw WHERE host_id = ?")
			.bind("host-001")
			.all<{ ts: number }>();

		expect(remaining.results).toHaveLength(1);
		expect(remaining.results[0].ts).toBe(recentTs);
	});

	test("removes hourly data older than 90 days", async () => {
		const now = 1700000000;
		await insertHost(db, "host-001", now);

		// Old hourly (91 days ago)
		const oldHourTs = now - 91 * 86400;
		await db
			.prepare(
				`INSERT INTO metrics_hourly (host_id, hour_ts, sample_count, cpu_usage_avg, cpu_usage_max,
         cpu_iowait_avg, cpu_steal_avg, cpu_load1_avg, cpu_load5_avg, cpu_load15_avg,
         mem_total, mem_available_min, mem_used_pct_avg, mem_used_pct_max,
         swap_total, swap_used_max, swap_used_pct_avg, swap_used_pct_max,
         uptime_min, disk_json, net_rx_bytes_avg, net_rx_bytes_max,
         net_tx_bytes_avg, net_tx_bytes_max, net_rx_errors, net_tx_errors)
       VALUES (?, ?, 10, 20, 30, 1, 0, 0.5, 0.3, 0.2,
         8000000000, 4000000000, 50, 60, 2000000000, 100000000, 5, 8,
         86000, '[]', 1000, 5000, 500, 2000, 0, 0)`,
			)
			.bind("host-001", oldHourTs)
			.run();

		// Recent hourly (30 days ago)
		const recentHourTs = now - 30 * 86400;
		await db
			.prepare(
				`INSERT INTO metrics_hourly (host_id, hour_ts, sample_count, cpu_usage_avg, cpu_usage_max,
         cpu_iowait_avg, cpu_steal_avg, cpu_load1_avg, cpu_load5_avg, cpu_load15_avg,
         mem_total, mem_available_min, mem_used_pct_avg, mem_used_pct_max,
         swap_total, swap_used_max, swap_used_pct_avg, swap_used_pct_max,
         uptime_min, disk_json, net_rx_bytes_avg, net_rx_bytes_max,
         net_tx_bytes_avg, net_tx_bytes_max, net_rx_errors, net_tx_errors)
       VALUES (?, ?, 10, 20, 30, 1, 0, 0.5, 0.3, 0.2,
         8000000000, 4000000000, 50, 60, 2000000000, 100000000, 5, 8,
         86000, '[]', 1000, 5000, 500, 2000, 0, 0)`,
			)
			.bind("host-001", recentHourTs)
			.run();

		await purgeOldData(db, now);

		const remaining = await db
			.prepare("SELECT hour_ts FROM metrics_hourly WHERE host_id = ?")
			.bind("host-001")
			.all<{ hour_ts: number }>();

		expect(remaining.results).toHaveLength(1);
		expect(remaining.results[0].hour_ts).toBe(recentHourTs);
	});

	test("uses correct retention constants", () => {
		expect(RETENTION.RAW_DAYS).toBe(7);
		expect(RETENTION.HOURLY_DAYS).toBe(90);
	});
});
