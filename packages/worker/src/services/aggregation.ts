// Hourly aggregation and data purge service
import { RETENTION } from "@bat/shared";
import { EVENT_RETENTION_DAYS } from "@bat/shared";

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
       oom_kills, fd_allocated, fd_max,
       interrupts_sec, softirq_net_rx_sec, softirq_block_sec, tasks_running, tasks_total,
       mem_buffers, mem_cached, mem_dirty, mem_writeback, mem_shmem,
       mem_slab_reclaimable, mem_slab_unreclaim, mem_committed_as, mem_commit_limit, mem_hw_corrupted,
       swap_in_sec, swap_out_sec, pgmajfault_sec, pgpgin_sec, pgpgout_sec,
       psi_cpu_some_total_delta, psi_mem_some_total_delta, psi_mem_full_total_delta,
       psi_io_some_total_delta, psi_io_full_total_delta,
       tcp_mem_pages, sockets_used, udp_inuse, udp_mem_pages,
       snmp_retrans_segs_sec, snmp_active_opens_sec, snmp_passive_opens_sec,
       snmp_attempt_fails_delta, snmp_estab_resets_delta, snmp_in_errs_delta, snmp_out_rsts_delta,
       snmp_udp_rcvbuf_errors_delta, snmp_udp_sndbuf_errors_delta, snmp_udp_in_errors_delta,
       netstat_listen_overflows_delta, netstat_listen_drops_delta,
       netstat_tcp_timeouts_delta, netstat_tcp_syn_retrans_delta,
       netstat_tcp_fast_retrans_delta, netstat_tcp_ofo_queue_delta,
       netstat_tcp_abort_on_memory_delta, netstat_syncookies_sent_delta,
       softnet_processed_delta, softnet_dropped_delta, softnet_time_squeeze_delta,
       conntrack_count, conntrack_max
     FROM metrics_raw
     WHERE host_id = ? AND ts >= ? AND ts < ?
     ORDER BY ts ASC`,
		)
		.bind(hostId, hourTs, hourEnd)
		.all<RawRow>();

	const rows = rawResult.results;
	if (rows.length === 0) {
		return;
	}

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

	// Disk I/O: per-device aggregation (AVG for rates, AVG+MAX for io_util_pct)
	const diskIoJson = aggregateDiskIo(rows);

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

	// --- Signal expansion aggregates (stored as ext_json) ---
	// D1 has a 100-column-per-table limit; these go into a single JSON column.
	const ext = buildExtJson(rows);
	const extJson = ext !== null ? JSON.stringify(ext) : null;

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
  fd_allocated_avg, fd_allocated_max, fd_max,
  ext_json
) VALUES (${new Array(60).fill("?").join(", ")})
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
  fd_max = excluded.fd_max,
  ext_json = excluded.ext_json`,
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
			extJson,
		)
		.run();
}

/**
 * Build ext_json object from signal expansion aggregates.
 * Returns null if all values are null (no signal expansion data in this hour).
 * Keys use the same names as the former scalar columns for backward compatibility
 * with the metrics read route, which unpacks ext_json into MetricsDataPoint.
 */
function buildExtJson(rows: RawRow[]): Record<string, number | null> | null {
	const ext: Record<string, number | null> = {
		interrupts_sec_avg: avgNullable(rows.map((r) => r.interrupts_sec)),
		interrupts_sec_max: maxNullable(rows.map((r) => r.interrupts_sec)),
		softirq_net_rx_sec_avg: avgNullable(rows.map((r) => r.softirq_net_rx_sec)),
		softirq_net_rx_sec_max: maxNullable(rows.map((r) => r.softirq_net_rx_sec)),
		softirq_block_sec_avg: avgNullable(rows.map((r) => r.softirq_block_sec)),
		softirq_block_sec_max: maxNullable(rows.map((r) => r.softirq_block_sec)),
		tasks_running_avg: avgNullable(rows.map((r) => r.tasks_running)),
		tasks_running_max: maxNullable(rows.map((r) => r.tasks_running)),
		tasks_total_avg: avgNullable(rows.map((r) => r.tasks_total)),
		tasks_total_max: maxNullable(rows.map((r) => r.tasks_total)),
		mem_buffers_avg: avgNullable(rows.map((r) => r.mem_buffers)),
		mem_cached_avg: avgNullable(rows.map((r) => r.mem_cached)),
		mem_dirty_avg: avgNullable(rows.map((r) => r.mem_dirty)),
		mem_dirty_max: maxNullable(rows.map((r) => r.mem_dirty)),
		mem_writeback_avg: avgNullable(rows.map((r) => r.mem_writeback)),
		mem_shmem_avg: avgNullable(rows.map((r) => r.mem_shmem)),
		mem_slab_reclaimable_avg: avgNullable(rows.map((r) => r.mem_slab_reclaimable)),
		mem_slab_unreclaim_avg: avgNullable(rows.map((r) => r.mem_slab_unreclaim)),
		mem_committed_as_avg: avgNullable(rows.map((r) => r.mem_committed_as)),
		mem_committed_as_max: maxNullable(rows.map((r) => r.mem_committed_as)),
		mem_commit_limit: rows[rows.length - 1].mem_commit_limit,
		mem_hw_corrupted_max: maxNullable(rows.map((r) => r.mem_hw_corrupted)),
		swap_in_sec_avg: avgNullable(rows.map((r) => r.swap_in_sec)),
		swap_in_sec_max: maxNullable(rows.map((r) => r.swap_in_sec)),
		swap_out_sec_avg: avgNullable(rows.map((r) => r.swap_out_sec)),
		swap_out_sec_max: maxNullable(rows.map((r) => r.swap_out_sec)),
		pgmajfault_sec_avg: avgNullable(rows.map((r) => r.pgmajfault_sec)),
		pgmajfault_sec_max: maxNullable(rows.map((r) => r.pgmajfault_sec)),
		pgpgin_sec_avg: avgNullable(rows.map((r) => r.pgpgin_sec)),
		pgpgout_sec_avg: avgNullable(rows.map((r) => r.pgpgout_sec)),
		psi_cpu_some_total_delta_sum: sumNullable(rows.map((r) => r.psi_cpu_some_total_delta)),
		psi_mem_some_total_delta_sum: sumNullable(rows.map((r) => r.psi_mem_some_total_delta)),
		psi_mem_full_total_delta_sum: sumNullable(rows.map((r) => r.psi_mem_full_total_delta)),
		psi_io_some_total_delta_sum: sumNullable(rows.map((r) => r.psi_io_some_total_delta)),
		psi_io_full_total_delta_sum: sumNullable(rows.map((r) => r.psi_io_full_total_delta)),
		tcp_mem_pages_avg: avgNullable(rows.map((r) => r.tcp_mem_pages)),
		tcp_mem_pages_max: maxNullable(rows.map((r) => r.tcp_mem_pages)),
		sockets_used_avg: avgNullable(rows.map((r) => r.sockets_used)),
		sockets_used_max: maxNullable(rows.map((r) => r.sockets_used)),
		udp_inuse_avg: avgNullable(rows.map((r) => r.udp_inuse)),
		udp_inuse_max: maxNullable(rows.map((r) => r.udp_inuse)),
		udp_mem_pages_avg: avgNullable(rows.map((r) => r.udp_mem_pages)),
		udp_mem_pages_max: maxNullable(rows.map((r) => r.udp_mem_pages)),
		snmp_retrans_segs_sec_avg: avgNullable(rows.map((r) => r.snmp_retrans_segs_sec)),
		snmp_retrans_segs_sec_max: maxNullable(rows.map((r) => r.snmp_retrans_segs_sec)),
		snmp_active_opens_sec_avg: avgNullable(rows.map((r) => r.snmp_active_opens_sec)),
		snmp_passive_opens_sec_avg: avgNullable(rows.map((r) => r.snmp_passive_opens_sec)),
		snmp_attempt_fails_delta_sum: sumNullable(rows.map((r) => r.snmp_attempt_fails_delta)),
		snmp_estab_resets_delta_sum: sumNullable(rows.map((r) => r.snmp_estab_resets_delta)),
		snmp_in_errs_delta_sum: sumNullable(rows.map((r) => r.snmp_in_errs_delta)),
		snmp_out_rsts_delta_sum: sumNullable(rows.map((r) => r.snmp_out_rsts_delta)),
		snmp_udp_rcvbuf_errors_delta_sum: sumNullable(rows.map((r) => r.snmp_udp_rcvbuf_errors_delta)),
		snmp_udp_sndbuf_errors_delta_sum: sumNullable(rows.map((r) => r.snmp_udp_sndbuf_errors_delta)),
		snmp_udp_in_errors_delta_sum: sumNullable(rows.map((r) => r.snmp_udp_in_errors_delta)),
		netstat_listen_overflows_delta_sum: sumNullable(
			rows.map((r) => r.netstat_listen_overflows_delta),
		),
		netstat_listen_drops_delta_sum: sumNullable(rows.map((r) => r.netstat_listen_drops_delta)),
		netstat_tcp_timeouts_delta_sum: sumNullable(rows.map((r) => r.netstat_tcp_timeouts_delta)),
		netstat_tcp_syn_retrans_delta_sum: sumNullable(
			rows.map((r) => r.netstat_tcp_syn_retrans_delta),
		),
		netstat_tcp_fast_retrans_delta_sum: sumNullable(
			rows.map((r) => r.netstat_tcp_fast_retrans_delta),
		),
		netstat_tcp_ofo_queue_delta_sum: sumNullable(rows.map((r) => r.netstat_tcp_ofo_queue_delta)),
		netstat_tcp_abort_on_memory_delta_sum: sumNullable(
			rows.map((r) => r.netstat_tcp_abort_on_memory_delta),
		),
		netstat_syncookies_sent_delta_sum: sumNullable(
			rows.map((r) => r.netstat_syncookies_sent_delta),
		),
		softnet_processed_delta_sum: sumNullable(rows.map((r) => r.softnet_processed_delta)),
		softnet_dropped_delta_sum: sumNullable(rows.map((r) => r.softnet_dropped_delta)),
		softnet_time_squeeze_delta_sum: sumNullable(rows.map((r) => r.softnet_time_squeeze_delta)),
		conntrack_count_avg: avgNullable(rows.map((r) => r.conntrack_count)),
		conntrack_count_max: maxNullable(rows.map((r) => r.conntrack_count)),
		conntrack_max: rows[rows.length - 1].conntrack_max,
	};

	// Return null if every value is null (no signal expansion data)
	if (Object.values(ext).every((v) => v === null)) {
		return null;
	}
	return ext;
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

/** Raw disk_io_json entry (from probe) */
interface DiskIoRawEntry {
	device: string;
	read_iops: number;
	write_iops: number;
	read_bytes_sec: number;
	write_bytes_sec: number;
	io_util_pct: number;
}

/** Hourly aggregated disk_io_json entry (per doc §582) */
interface DiskIoHourlyEntry {
	device: string;
	read_iops_avg: number;
	write_iops_avg: number;
	read_bytes_sec_avg: number;
	write_bytes_sec_avg: number;
	io_util_pct_avg: number;
	io_util_pct_max: number;
}

/**
 * Aggregate disk I/O metrics across samples.
 * Groups by device, computes AVG for rate fields and AVG+MAX for io_util_pct.
 * Returns null if all rows have null disk_io_json.
 */
function aggregateDiskIo(rows: RawRow[]): string | null {
	// Collect per-device samples: device → array of raw entries
	const deviceSamples = new Map<string, DiskIoRawEntry[]>();
	let hasAny = false;

	for (const row of rows) {
		if (row.disk_io_json == null) {
			continue;
		}
		let entries: DiskIoRawEntry[] = [];
		try {
			entries = JSON.parse(row.disk_io_json) as DiskIoRawEntry[];
		} catch {
			continue;
		}
		if (entries.length === 0) {
			continue;
		}
		hasAny = true;
		for (const e of entries) {
			let arr = deviceSamples.get(e.device);
			if (!arr) {
				arr = [];
				deviceSamples.set(e.device, arr);
			}
			arr.push(e);
		}
	}

	if (!hasAny) {
		return null;
	}

	// Aggregate per device
	const result: DiskIoHourlyEntry[] = [];
	for (const [device, samples] of deviceSamples) {
		result.push({
			device,
			read_iops_avg: avg(samples.map((s) => s.read_iops)),
			write_iops_avg: avg(samples.map((s) => s.write_iops)),
			read_bytes_sec_avg: avg(samples.map((s) => s.read_bytes_sec)),
			write_bytes_sec_avg: avg(samples.map((s) => s.write_bytes_sec)),
			io_util_pct_avg: avg(samples.map((s) => s.io_util_pct)),
			io_util_pct_max: max(samples.map((s) => s.io_util_pct)),
		});
	}

	return JSON.stringify(result);
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

	// Purge old events (30-day retention)
	const eventCutoff = nowSeconds - EVENT_RETENTION_DAYS * 86400;
	await db.prepare("DELETE FROM events WHERE created_at < ?").bind(eventCutoff).run();
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
	// Signal expansion fields (nullable)
	interrupts_sec: number | null;
	softirq_net_rx_sec: number | null;
	softirq_block_sec: number | null;
	tasks_running: number | null;
	tasks_total: number | null;
	mem_buffers: number | null;
	mem_cached: number | null;
	mem_dirty: number | null;
	mem_writeback: number | null;
	mem_shmem: number | null;
	mem_slab_reclaimable: number | null;
	mem_slab_unreclaim: number | null;
	mem_committed_as: number | null;
	mem_commit_limit: number | null;
	mem_hw_corrupted: number | null;
	swap_in_sec: number | null;
	swap_out_sec: number | null;
	pgmajfault_sec: number | null;
	pgpgin_sec: number | null;
	pgpgout_sec: number | null;
	psi_cpu_some_total_delta: number | null;
	psi_mem_some_total_delta: number | null;
	psi_mem_full_total_delta: number | null;
	psi_io_some_total_delta: number | null;
	psi_io_full_total_delta: number | null;
	tcp_mem_pages: number | null;
	sockets_used: number | null;
	udp_inuse: number | null;
	udp_mem_pages: number | null;
	snmp_retrans_segs_sec: number | null;
	snmp_active_opens_sec: number | null;
	snmp_passive_opens_sec: number | null;
	snmp_attempt_fails_delta: number | null;
	snmp_estab_resets_delta: number | null;
	snmp_in_errs_delta: number | null;
	snmp_out_rsts_delta: number | null;
	snmp_udp_rcvbuf_errors_delta: number | null;
	snmp_udp_sndbuf_errors_delta: number | null;
	snmp_udp_in_errors_delta: number | null;
	netstat_listen_overflows_delta: number | null;
	netstat_listen_drops_delta: number | null;
	netstat_tcp_timeouts_delta: number | null;
	netstat_tcp_syn_retrans_delta: number | null;
	netstat_tcp_fast_retrans_delta: number | null;
	netstat_tcp_ofo_queue_delta: number | null;
	netstat_tcp_abort_on_memory_delta: number | null;
	netstat_syncookies_sent_delta: number | null;
	softnet_processed_delta: number | null;
	softnet_dropped_delta: number | null;
	softnet_time_squeeze_delta: number | null;
	conntrack_count: number | null;
	conntrack_max: number | null;
}

function avg(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	return values.reduce((a, b) => a + b, 0) / values.length;
}

function max(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	return Math.max(...values);
}

function min(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	return Math.min(...values);
}

/** Avg of non-null values. Returns null if all values are null. */
function avgNullable(values: (number | null)[]): number | null {
	const valid = values.filter((v): v is number => v != null);
	if (valid.length === 0) {
		return null;
	}
	return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/** Max of non-null values. Returns null if all values are null. */
function maxNullable(values: (number | null)[]): number | null {
	const valid = values.filter((v): v is number => v != null);
	if (valid.length === 0) {
		return null;
	}
	return Math.max(...valid);
}

/** Sum of non-null values. Returns null if all values are null. */
function sumNullable(values: (number | null)[]): number | null {
	const valid = values.filter((v): v is number => v != null);
	if (valid.length === 0) {
		return null;
	}
	return valid.reduce((a, b) => a + b, 0);
}
