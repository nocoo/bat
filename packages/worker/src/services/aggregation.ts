// Hourly aggregation and data purge service
import { RETENTION } from "@bat/shared";

/**
 * Aggregate raw metrics for all active hosts in a given hour.
 * Inserts/updates metrics_hourly rows.
 */
export async function aggregateHour(db: D1Database, hourTs: number): Promise<void> {
	const hourEnd = hourTs + 3600;

	// Get all active hosts that have raw data in this hour
	const hostsResult = await db
		.prepare(
			`SELECT DISTINCT mr.host_id
FROM metrics_raw mr
JOIN hosts h ON mr.host_id = h.host_id
WHERE h.is_active = 1 AND mr.ts >= ? AND mr.ts < ?`,
		)
		.bind(hourTs, hourEnd)
		.all<{ host_id: string }>();

	for (const { host_id } of hostsResult.results) {
		await aggregateHostHour(db, host_id, hourTs, hourEnd);
	}
}

async function aggregateHostHour(
	db: D1Database,
	hostId: string,
	hourTs: number,
	hourEnd: number,
): Promise<void> {
	// Get all raw rows for this host in this hour
	const rawResult = await db
		.prepare(
			`SELECT cpu_usage_pct, cpu_iowait, cpu_steal, cpu_load1, cpu_load5, cpu_load15,
       mem_total, mem_available, mem_used_pct,
       swap_total, swap_used, swap_used_pct,
       disk_json, net_json, uptime_seconds,
       psi_cpu_some_avg10, psi_cpu_some_avg60,
       psi_mem_some_avg60, psi_mem_full_avg60,
       psi_io_some_avg60, psi_io_full_avg60,
       disk_io_json,
       tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated,
       context_switches_sec, forks_sec, procs_running, procs_blocked,
       oom_kills, fd_allocated, fd_max
     FROM metrics_raw
     WHERE host_id = ? AND ts >= ? AND ts < ?
     ORDER BY ts ASC`,
		)
		.bind(hostId, hourTs, hourEnd)
		.all<RawRow>();

	const rows = rawResult.results;
	if (rows.length === 0) return;

	const n = rows.length;

	// CPU aggregates
	const cpuUsageAvg = avg(rows.map((r) => r.cpu_usage_pct));
	const cpuUsageMax = max(rows.map((r) => r.cpu_usage_pct));
	const cpuIowaitAvg = avg(rows.map((r) => r.cpu_iowait));
	const cpuStealAvg = avg(rows.map((r) => r.cpu_steal));
	const cpuLoad1Avg = avg(rows.map((r) => r.cpu_load1));
	const cpuLoad5Avg = avg(rows.map((r) => r.cpu_load5));
	const cpuLoad15Avg = avg(rows.map((r) => r.cpu_load15));

	// Memory aggregates
	const memTotal = rows[rows.length - 1].mem_total; // last value
	const memAvailableMin = min(rows.map((r) => r.mem_available));
	const memUsedPctAvg = avg(rows.map((r) => r.mem_used_pct));
	const memUsedPctMax = max(rows.map((r) => r.mem_used_pct));

	// Swap aggregates
	const swapTotal = rows[rows.length - 1].swap_total;
	const swapUsedMax = max(rows.map((r) => r.swap_used));
	const swapUsedPctAvg = avg(rows.map((r) => r.swap_used_pct));
	const swapUsedPctMax = max(rows.map((r) => r.swap_used_pct));

	// Uptime
	const uptimeMin = min(rows.map((r) => r.uptime_seconds));

	// Disk: use the last sample's disk_json
	const diskJson = rows[rows.length - 1].disk_json;

	// Network: parse net_json, sum across interfaces per sample, then avg/max
	const netAgg = aggregateNetwork(rows);

	// --- Tier 3 aggregates ---

	// PSI: avg + max for alert-relevant fields
	const psiCpuAvg10 = avgNullable(rows.map((r) => r.psi_cpu_some_avg10));
	const psiCpuMax10 = maxNullable(rows.map((r) => r.psi_cpu_some_avg10));
	const psiCpuAvg60 = avgNullable(rows.map((r) => r.psi_cpu_some_avg60));
	const psiCpuMax60 = maxNullable(rows.map((r) => r.psi_cpu_some_avg60));
	const psiMemSomeAvg60 = avgNullable(rows.map((r) => r.psi_mem_some_avg60));
	const psiMemSomeMax60 = maxNullable(rows.map((r) => r.psi_mem_some_avg60));
	const psiMemFullAvg60 = avgNullable(rows.map((r) => r.psi_mem_full_avg60));
	const psiMemFullMax60 = maxNullable(rows.map((r) => r.psi_mem_full_avg60));
	const psiIoSomeAvg60 = avgNullable(rows.map((r) => r.psi_io_some_avg60));
	const psiIoSomeMax60 = maxNullable(rows.map((r) => r.psi_io_some_avg60));
	const psiIoFullAvg60 = avgNullable(rows.map((r) => r.psi_io_full_avg60));
	const psiIoFullMax60 = maxNullable(rows.map((r) => r.psi_io_full_avg60));

	// Disk I/O: use last sample's disk_io_json (same pattern as disk_json)
	const diskIoJson = rows[rows.length - 1].disk_io_json;

	// TCP: avg + max
	const tcpEstablishedAvg = avgNullable(rows.map((r) => r.tcp_established));
	const tcpEstablishedMax = maxNullable(rows.map((r) => r.tcp_established));
	const tcpTimeWaitAvg = avgNullable(rows.map((r) => r.tcp_time_wait));
	const tcpTimeWaitMax = maxNullable(rows.map((r) => r.tcp_time_wait));
	const tcpOrphanAvg = avgNullable(rows.map((r) => r.tcp_orphan));
	const tcpOrphanMax = maxNullable(rows.map((r) => r.tcp_orphan));
	const tcpAllocatedAvg = avgNullable(rows.map((r) => r.tcp_allocated));
	const tcpAllocatedMax = maxNullable(rows.map((r) => r.tcp_allocated));

	// CPU extensions: avg + max for rates and gauges
	const ctxSwitchAvg = avgNullable(rows.map((r) => r.context_switches_sec));
	const ctxSwitchMax = maxNullable(rows.map((r) => r.context_switches_sec));
	const forksAvg = avgNullable(rows.map((r) => r.forks_sec));
	const forksMax = maxNullable(rows.map((r) => r.forks_sec));
	const procsRunAvg = avgNullable(rows.map((r) => r.procs_running));
	const procsRunMax = maxNullable(rows.map((r) => r.procs_running));
	const procsBlkAvg = avgNullable(rows.map((r) => r.procs_blocked));
	const procsBlkMax = maxNullable(rows.map((r) => r.procs_blocked));

	// OOM kills: sum of deltas
	const oomKillsSum = sumNullable(rows.map((r) => r.oom_kills));

	// File descriptors: avg + max for allocated, last for max
	const fdAllocatedAvg = avgNullable(rows.map((r) => r.fd_allocated));
	const fdAllocatedMax = maxNullable(rows.map((r) => r.fd_allocated));
	const fdMaxLast = rows[rows.length - 1].fd_max;

	await db
		.prepare(
			`INSERT INTO metrics_hourly (
  host_id, hour_ts, sample_count,
  cpu_usage_avg, cpu_usage_max, cpu_iowait_avg, cpu_steal_avg,
  cpu_load1_avg, cpu_load5_avg, cpu_load15_avg,
  mem_total, mem_available_min, mem_used_pct_avg, mem_used_pct_max,
  swap_total, swap_used_max, swap_used_pct_avg, swap_used_pct_max,
  uptime_min, disk_json,
  net_rx_bytes_avg, net_rx_bytes_max, net_tx_bytes_avg, net_tx_bytes_max,
  net_rx_errors, net_tx_errors,
  psi_cpu_some_avg10_avg, psi_cpu_some_avg10_max,
  psi_cpu_some_avg60_avg, psi_cpu_some_avg60_max,
  psi_mem_some_avg60_avg, psi_mem_some_avg60_max,
  psi_mem_full_avg60_avg, psi_mem_full_avg60_max,
  psi_io_some_avg60_avg, psi_io_some_avg60_max,
  psi_io_full_avg60_avg, psi_io_full_avg60_max,
  disk_io_json,
  tcp_established_avg, tcp_established_max,
  tcp_time_wait_avg, tcp_time_wait_max,
  tcp_orphan_avg, tcp_orphan_max,
  tcp_allocated_avg, tcp_allocated_max,
  context_switches_sec_avg, context_switches_sec_max,
  forks_sec_avg, forks_sec_max,
  procs_running_avg, procs_running_max,
  procs_blocked_avg, procs_blocked_max,
  oom_kills_sum,
  fd_allocated_avg, fd_allocated_max, fd_max
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(host_id, hour_ts) DO UPDATE SET
  sample_count = excluded.sample_count,
  cpu_usage_avg = excluded.cpu_usage_avg,
  cpu_usage_max = excluded.cpu_usage_max,
  cpu_iowait_avg = excluded.cpu_iowait_avg,
  cpu_steal_avg = excluded.cpu_steal_avg,
  cpu_load1_avg = excluded.cpu_load1_avg,
  cpu_load5_avg = excluded.cpu_load5_avg,
  cpu_load15_avg = excluded.cpu_load15_avg,
  mem_total = excluded.mem_total,
  mem_available_min = excluded.mem_available_min,
  mem_used_pct_avg = excluded.mem_used_pct_avg,
  mem_used_pct_max = excluded.mem_used_pct_max,
  swap_total = excluded.swap_total,
  swap_used_max = excluded.swap_used_max,
  swap_used_pct_avg = excluded.swap_used_pct_avg,
  swap_used_pct_max = excluded.swap_used_pct_max,
  uptime_min = excluded.uptime_min,
  disk_json = excluded.disk_json,
  net_rx_bytes_avg = excluded.net_rx_bytes_avg,
  net_rx_bytes_max = excluded.net_rx_bytes_max,
  net_tx_bytes_avg = excluded.net_tx_bytes_avg,
  net_tx_bytes_max = excluded.net_tx_bytes_max,
  net_rx_errors = excluded.net_rx_errors,
  net_tx_errors = excluded.net_tx_errors,
  psi_cpu_some_avg10_avg = excluded.psi_cpu_some_avg10_avg,
  psi_cpu_some_avg10_max = excluded.psi_cpu_some_avg10_max,
  psi_cpu_some_avg60_avg = excluded.psi_cpu_some_avg60_avg,
  psi_cpu_some_avg60_max = excluded.psi_cpu_some_avg60_max,
  psi_mem_some_avg60_avg = excluded.psi_mem_some_avg60_avg,
  psi_mem_some_avg60_max = excluded.psi_mem_some_avg60_max,
  psi_mem_full_avg60_avg = excluded.psi_mem_full_avg60_avg,
  psi_mem_full_avg60_max = excluded.psi_mem_full_avg60_max,
  psi_io_some_avg60_avg = excluded.psi_io_some_avg60_avg,
  psi_io_some_avg60_max = excluded.psi_io_some_avg60_max,
  psi_io_full_avg60_avg = excluded.psi_io_full_avg60_avg,
  psi_io_full_avg60_max = excluded.psi_io_full_avg60_max,
  disk_io_json = excluded.disk_io_json,
  tcp_established_avg = excluded.tcp_established_avg,
  tcp_established_max = excluded.tcp_established_max,
  tcp_time_wait_avg = excluded.tcp_time_wait_avg,
  tcp_time_wait_max = excluded.tcp_time_wait_max,
  tcp_orphan_avg = excluded.tcp_orphan_avg,
  tcp_orphan_max = excluded.tcp_orphan_max,
  tcp_allocated_avg = excluded.tcp_allocated_avg,
  tcp_allocated_max = excluded.tcp_allocated_max,
  context_switches_sec_avg = excluded.context_switches_sec_avg,
  context_switches_sec_max = excluded.context_switches_sec_max,
  forks_sec_avg = excluded.forks_sec_avg,
  forks_sec_max = excluded.forks_sec_max,
  procs_running_avg = excluded.procs_running_avg,
  procs_running_max = excluded.procs_running_max,
  procs_blocked_avg = excluded.procs_blocked_avg,
  procs_blocked_max = excluded.procs_blocked_max,
  oom_kills_sum = excluded.oom_kills_sum,
  fd_allocated_avg = excluded.fd_allocated_avg,
  fd_allocated_max = excluded.fd_allocated_max,
  fd_max = excluded.fd_max`,
		)
		.bind(
			hostId,
			hourTs,
			n,
			cpuUsageAvg,
			cpuUsageMax,
			cpuIowaitAvg,
			cpuStealAvg,
			cpuLoad1Avg,
			cpuLoad5Avg,
			cpuLoad15Avg,
			memTotal,
			memAvailableMin,
			memUsedPctAvg,
			memUsedPctMax,
			swapTotal,
			swapUsedMax,
			swapUsedPctAvg,
			swapUsedPctMax,
			uptimeMin,
			diskJson,
			netAgg.rxBytesAvg,
			netAgg.rxBytesMax,
			netAgg.txBytesAvg,
			netAgg.txBytesMax,
			netAgg.rxErrors,
			netAgg.txErrors,
			psiCpuAvg10,
			psiCpuMax10,
			psiCpuAvg60,
			psiCpuMax60,
			psiMemSomeAvg60,
			psiMemSomeMax60,
			psiMemFullAvg60,
			psiMemFullMax60,
			psiIoSomeAvg60,
			psiIoSomeMax60,
			psiIoFullAvg60,
			psiIoFullMax60,
			diskIoJson,
			tcpEstablishedAvg,
			tcpEstablishedMax,
			tcpTimeWaitAvg,
			tcpTimeWaitMax,
			tcpOrphanAvg,
			tcpOrphanMax,
			tcpAllocatedAvg,
			tcpAllocatedMax,
			ctxSwitchAvg,
			ctxSwitchMax,
			forksAvg,
			forksMax,
			procsRunAvg,
			procsRunMax,
			procsBlkAvg,
			procsBlkMax,
			oomKillsSum,
			fdAllocatedAvg,
			fdAllocatedMax,
			fdMaxLast,
		)
		.run();
}

interface NetInterface {
	iface: string;
	rx_bytes_rate: number;
	tx_bytes_rate: number;
	rx_errors: number;
	tx_errors: number;
}

interface NetAggResult {
	rxBytesAvg: number;
	rxBytesMax: number;
	txBytesAvg: number;
	txBytesMax: number;
	rxErrors: number;
	txErrors: number;
}

/**
 * Aggregate network metrics across samples.
 * For each sample: sum rx/tx across all interfaces to get per-sample totals.
 * Then compute avg/max across samples, and sum errors.
 */
function aggregateNetwork(rows: RawRow[]): NetAggResult {
	const sampleRxTotals: number[] = [];
	const sampleTxTotals: number[] = [];
	let totalRxErrors = 0;
	let totalTxErrors = 0;

	for (const row of rows) {
		let interfaces: NetInterface[] = [];
		try {
			interfaces = JSON.parse(row.net_json || "[]") as NetInterface[];
		} catch {
			// skip bad JSON
		}

		let sampleRx = 0;
		let sampleTx = 0;
		for (const iface of interfaces) {
			sampleRx += iface.rx_bytes_rate;
			sampleTx += iface.tx_bytes_rate;
			totalRxErrors += iface.rx_errors;
			totalTxErrors += iface.tx_errors;
		}
		sampleRxTotals.push(sampleRx);
		sampleTxTotals.push(sampleTx);
	}

	return {
		rxBytesAvg: avg(sampleRxTotals),
		rxBytesMax: max(sampleRxTotals),
		txBytesAvg: avg(sampleTxTotals),
		txBytesMax: max(sampleTxTotals),
		rxErrors: totalRxErrors,
		txErrors: totalTxErrors,
	};
}

/**
 * Purge old data beyond retention windows.
 * - metrics_raw: older than 7 days
 * - metrics_hourly: older than 90 days
 * - tier2_snapshots: older than 90 days
 */
export async function purgeOldData(db: D1Database, nowSeconds: number): Promise<void> {
	const rawCutoff = nowSeconds - RETENTION.RAW_DAYS * 86400;
	const hourlyCutoff = nowSeconds - RETENTION.HOURLY_DAYS * 86400;

	await db.prepare("DELETE FROM metrics_raw WHERE ts < ?").bind(rawCutoff).run();

	await db.prepare("DELETE FROM metrics_hourly WHERE hour_ts < ?").bind(hourlyCutoff).run();

	await db.prepare("DELETE FROM tier2_snapshots WHERE ts < ?").bind(hourlyCutoff).run();
}

// --- Helpers ---

interface RawRow {
	cpu_usage_pct: number;
	cpu_iowait: number;
	cpu_steal: number;
	cpu_load1: number;
	cpu_load5: number;
	cpu_load15: number;
	mem_total: number;
	mem_available: number;
	mem_used_pct: number;
	swap_total: number;
	swap_used: number;
	swap_used_pct: number;
	disk_json: string;
	net_json: string;
	uptime_seconds: number;
	// Tier 3 fields (nullable)
	psi_cpu_some_avg10: number | null;
	psi_cpu_some_avg60: number | null;
	psi_mem_some_avg60: number | null;
	psi_mem_full_avg60: number | null;
	psi_io_some_avg60: number | null;
	psi_io_full_avg60: number | null;
	disk_io_json: string | null;
	tcp_established: number | null;
	tcp_time_wait: number | null;
	tcp_orphan: number | null;
	tcp_allocated: number | null;
	context_switches_sec: number | null;
	forks_sec: number | null;
	procs_running: number | null;
	procs_blocked: number | null;
	oom_kills: number | null;
	fd_allocated: number | null;
	fd_max: number | null;
}

function avg(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((a, b) => a + b, 0) / values.length;
}

function max(values: number[]): number {
	if (values.length === 0) return 0;
	return Math.max(...values);
}

function min(values: number[]): number {
	if (values.length === 0) return 0;
	return Math.min(...values);
}

/** Avg of non-null values. Returns null if all values are null. */
function avgNullable(values: (number | null)[]): number | null {
	const valid = values.filter((v): v is number => v != null);
	if (valid.length === 0) return null;
	return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/** Max of non-null values. Returns null if all values are null. */
function maxNullable(values: (number | null)[]): number | null {
	const valid = values.filter((v): v is number => v != null);
	if (valid.length === 0) return null;
	return Math.max(...valid);
}

/** Sum of non-null values. Returns null if all values are null. */
function sumNullable(values: (number | null)[]): number | null {
	const valid = values.filter((v): v is number => v != null);
	if (valid.length === 0) return null;
	return valid.reduce((a, b) => a + b, 0);
}
