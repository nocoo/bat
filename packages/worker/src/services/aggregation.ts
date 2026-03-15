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
       disk_json, net_json, uptime_seconds
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
  net_rx_errors, net_tx_errors
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  net_tx_errors = excluded.net_tx_errors`,
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
 */
export async function purgeOldData(db: D1Database, nowSeconds: number): Promise<void> {
	const rawCutoff = nowSeconds - RETENTION.RAW_DAYS * 86400;
	const hourlyCutoff = nowSeconds - RETENTION.HOURLY_DAYS * 86400;

	await db.prepare("DELETE FROM metrics_raw WHERE ts < ?").bind(rawCutoff).run();

	await db.prepare("DELETE FROM metrics_hourly WHERE hour_ts < ?").bind(hourlyCutoff).run();
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
