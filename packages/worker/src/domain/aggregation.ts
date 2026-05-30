// Pure aggregation helpers used by the hourly metrics aggregator. No I/O —
// all functions take in-memory raw rows and return aggregated values.
// Lifted verbatim from `services/aggregation.ts`; the adapter consumes
// these to compose its INSERT … ON CONFLICT batch.

export function avg(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	return values.reduce((a, b) => a + b, 0) / values.length;
}

export function max(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	return Math.max(...values);
}

export function min(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	return Math.min(...values);
}

/** Avg of non-null values. Returns null if all values are null. */
export function avgNullable(values: (number | null)[]): number | null {
	const valid = values.filter((v): v is number => v != null);
	if (valid.length === 0) {
		return null;
	}
	return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/** Max of non-null values. Returns null if all values are null. */
export function maxNullable(values: (number | null)[]): number | null {
	const valid = values.filter((v): v is number => v != null);
	if (valid.length === 0) {
		return null;
	}
	return Math.max(...valid);
}

/** Sum of non-null values. Returns null if all values are null. */
export function sumNullable(values: (number | null)[]): number | null {
	const valid = values.filter((v): v is number => v != null);
	if (valid.length === 0) {
		return null;
	}
	return valid.reduce((a, b) => a + b, 0);
}

/** Subset of metrics_raw row used by the aggregator. */
export interface RawRow {
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

interface NetInterface {
	iface: string;
	rx_bytes_rate: number;
	tx_bytes_rate: number;
	rx_errors: number;
	tx_errors: number;
}

export interface NetAggResult {
	rxBytesAvg: number;
	rxBytesMax: number;
	txBytesAvg: number;
	txBytesMax: number;
	rxErrors: number;
	txErrors: number;
}

/**
 * Aggregate network metrics across samples. For each sample: sum rx/tx
 * across all interfaces to get per-sample totals. Then compute avg/max
 * across samples, and sum errors.
 */
export function aggregateNetwork(rows: RawRow[]): NetAggResult {
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

interface DiskIoRawEntry {
	device: string;
	read_iops: number;
	write_iops: number;
	read_bytes_sec: number;
	write_bytes_sec: number;
	io_util_pct: number;
}

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
 * Aggregate disk I/O metrics across samples. Groups by device, computes
 * AVG for rate fields and AVG+MAX for io_util_pct. Returns null if all
 * rows have null disk_io_json.
 */
export function aggregateDiskIo(rows: RawRow[]): string | null {
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
 * Build ext_json object from signal expansion aggregates. Returns null
 * if all values are null (no signal expansion data in this hour). Keys
 * use the same names as the former scalar columns for backward compat
 * with the metrics read route.
 */
export function buildExtJson(rows: RawRow[]): Record<string, number | null> | null {
	const lastRow = rows[rows.length - 1] as RawRow;
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
		mem_commit_limit: lastRow.mem_commit_limit,
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
		conntrack_max: lastRow.conntrack_max,
	};

	if (Object.values(ext).every((v) => v === null)) {
		return null;
	}
	return ext;
}
