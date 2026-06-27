// D1-backed MetricsRepository. Owns the raw + hourly SELECTs lifted
// from the previous `routes/metrics.ts` and the `metrics_raw INSERT
// OR IGNORE` lifted from the now-deleted `services/metrics.ts`. The
// `insertRawWithHostUpsert` method composes the host upsert SQL
// directly here (rather than depending on `D1HostsRepository`) so the
// two statements run as a single `db.batch` and stay atomic across the
// FK target.

import type { MetricsPayload } from "@bat/shared";
import type { MetricsHourlyRow, MetricsRawRow, MetricsRepository } from "../../repos/types.js";

/**
 * Build the INSERT OR IGNORE statement for metrics_raw. Used both by the
 * adapter's `insertRawWithHostUpsert` and (indirectly) by tests that need
 * to inspect the prepared statement. Kept private — callers go through
 * the repository surface.
 *
 * `top_processes_json` is intentionally not in this INSERT — the latest
 * snapshot is mirrored onto `hosts.top_processes_json` by the host
 * upsert/touch SQL below. That column will be physically dropped by
 * migration 0027.
 */
function buildInsertMetricsRawStatement(
	db: D1Database,
	hostId: string,
	payload: MetricsPayload,
): D1PreparedStatement {
	return db
		.prepare(
			`INSERT OR IGNORE INTO metrics_raw
  (host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal, cpu_count,
   mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
   disk_json, net_json, uptime_seconds,
   psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
   psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
   psi_mem_full_avg10, psi_mem_full_avg60, psi_mem_full_avg300,
   psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
   psi_io_full_avg10, psi_io_full_avg60, psi_io_full_avg300,
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
   conntrack_count, conntrack_max)
VALUES (${new Array(97).fill("?").join(", ")})`,
		)
		.bind(
			hostId,
			payload.timestamp,
			payload.cpu.load1,
			payload.cpu.load5,
			payload.cpu.load15,
			payload.cpu.usage_pct,
			payload.cpu.iowait_pct,
			payload.cpu.steal_pct,
			payload.cpu.count,
			payload.mem.total_bytes,
			payload.mem.available_bytes,
			payload.mem.used_pct,
			payload.swap.total_bytes,
			payload.swap.used_bytes,
			payload.swap.used_pct,
			JSON.stringify(payload.disk),
			JSON.stringify(payload.net),
			payload.uptime_seconds,
			payload.psi?.cpu_some_avg10 ?? null,
			payload.psi?.cpu_some_avg60 ?? null,
			payload.psi?.cpu_some_avg300 ?? null,
			payload.psi?.mem_some_avg10 ?? null,
			payload.psi?.mem_some_avg60 ?? null,
			payload.psi?.mem_some_avg300 ?? null,
			payload.psi?.mem_full_avg10 ?? null,
			payload.psi?.mem_full_avg60 ?? null,
			payload.psi?.mem_full_avg300 ?? null,
			payload.psi?.io_some_avg10 ?? null,
			payload.psi?.io_some_avg60 ?? null,
			payload.psi?.io_some_avg300 ?? null,
			payload.psi?.io_full_avg10 ?? null,
			payload.psi?.io_full_avg60 ?? null,
			payload.psi?.io_full_avg300 ?? null,
			payload.disk_io ? JSON.stringify(payload.disk_io) : null,
			payload.tcp?.established ?? null,
			payload.tcp?.time_wait ?? null,
			payload.tcp?.orphan ?? null,
			payload.tcp?.allocated ?? null,
			payload.cpu.context_switches_sec ?? null,
			payload.cpu.forks_sec ?? null,
			payload.cpu.procs_running ?? null,
			payload.cpu.procs_blocked ?? null,
			payload.mem.oom_kills_delta ?? null,
			payload.fd?.allocated ?? null,
			payload.fd?.max ?? null,
			payload.cpu.interrupts_sec ?? null,
			payload.cpu.softirq_net_rx_sec ?? null,
			payload.cpu.softirq_block_sec ?? null,
			payload.cpu.tasks_running ?? null,
			payload.cpu.tasks_total ?? null,
			payload.mem.buffers ?? null,
			payload.mem.cached ?? null,
			payload.mem.dirty ?? null,
			payload.mem.writeback ?? null,
			payload.mem.shmem ?? null,
			payload.mem.slab_reclaimable ?? null,
			payload.mem.slab_unreclaim ?? null,
			payload.mem.committed_as ?? null,
			payload.mem.commit_limit ?? null,
			payload.mem.hw_corrupted ?? null,
			payload.mem.swap_in_sec ?? null,
			payload.mem.swap_out_sec ?? null,
			payload.mem.pgmajfault_sec ?? null,
			payload.mem.pgpgin_sec ?? null,
			payload.mem.pgpgout_sec ?? null,
			payload.psi?.cpu_some_total_delta ?? null,
			payload.psi?.mem_some_total_delta ?? null,
			payload.psi?.mem_full_total_delta ?? null,
			payload.psi?.io_some_total_delta ?? null,
			payload.psi?.io_full_total_delta ?? null,
			payload.tcp?.mem_pages ?? null,
			payload.socket?.sockets_used ?? null,
			payload.udp?.inuse ?? null,
			payload.udp?.mem_pages ?? null,
			payload.snmp?.retrans_segs_sec ?? null,
			payload.snmp?.active_opens_sec ?? null,
			payload.snmp?.passive_opens_sec ?? null,
			payload.snmp?.attempt_fails_delta ?? null,
			payload.snmp?.estab_resets_delta ?? null,
			payload.snmp?.in_errs_delta ?? null,
			payload.snmp?.out_rsts_delta ?? null,
			payload.snmp?.udp_rcvbuf_errors_delta ?? null,
			payload.snmp?.udp_sndbuf_errors_delta ?? null,
			payload.snmp?.udp_in_errors_delta ?? null,
			payload.netstat?.listen_overflows_delta ?? null,
			payload.netstat?.listen_drops_delta ?? null,
			payload.netstat?.tcp_timeouts_delta ?? null,
			payload.netstat?.tcp_syn_retrans_delta ?? null,
			payload.netstat?.tcp_fast_retrans_delta ?? null,
			payload.netstat?.tcp_ofo_queue_delta ?? null,
			payload.netstat?.tcp_abort_on_memory_delta ?? null,
			payload.netstat?.syncookies_sent_delta ?? null,
			payload.softnet?.processed_delta ?? null,
			payload.softnet?.dropped_delta ?? null,
			payload.softnet?.time_squeeze_delta ?? null,
			payload.conntrack?.count ?? null,
			payload.conntrack?.max ?? null,
		);
}

const RAW_SELECT_SQL = `SELECT ts, cpu_usage_pct, cpu_iowait, cpu_steal, cpu_load1, cpu_load5, cpu_load15,
       cpu_count, mem_total, mem_available, mem_used_pct,
       swap_total, swap_used, swap_used_pct, disk_json, net_json,
       NULL as net_rx_bytes_avg, NULL as net_rx_bytes_max,
       NULL as net_tx_bytes_avg, NULL as net_tx_bytes_max,
       NULL as net_rx_errors, NULL as net_tx_errors,
       uptime_seconds,
       psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
       psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
       psi_mem_full_avg10, psi_mem_full_avg60, psi_mem_full_avg300,
       psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
       psi_io_full_avg10, psi_io_full_avg60, psi_io_full_avg300,
       disk_io_json,
       tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated,
       context_switches_sec, forks_sec, procs_running, procs_blocked,
       oom_kills, fd_allocated, fd_max,
       json_object(
         'interrupts_sec', interrupts_sec,
         'softirq_net_rx_sec', softirq_net_rx_sec,
         'softirq_block_sec', softirq_block_sec,
         'tasks_running', tasks_running,
         'tasks_total', tasks_total,
         'mem_buffers', mem_buffers,
         'mem_cached', mem_cached,
         'mem_dirty', mem_dirty,
         'mem_writeback', mem_writeback,
         'mem_shmem', mem_shmem,
         'mem_slab_reclaimable', mem_slab_reclaimable,
         'mem_slab_unreclaim', mem_slab_unreclaim,
         'mem_committed_as', mem_committed_as,
         'mem_commit_limit', mem_commit_limit,
         'mem_hw_corrupted', mem_hw_corrupted,
         'swap_in_sec', swap_in_sec,
         'swap_out_sec', swap_out_sec,
         'pgmajfault_sec', pgmajfault_sec,
         'pgpgin_sec', pgpgin_sec,
         'pgpgout_sec', pgpgout_sec,
         'psi_cpu_some_total_delta', psi_cpu_some_total_delta,
         'psi_mem_some_total_delta', psi_mem_some_total_delta,
         'psi_mem_full_total_delta', psi_mem_full_total_delta,
         'psi_io_some_total_delta', psi_io_some_total_delta,
         'psi_io_full_total_delta', psi_io_full_total_delta,
         'tcp_mem_pages', tcp_mem_pages,
         'sockets_used', sockets_used,
         'udp_inuse', udp_inuse,
         'udp_mem_pages', udp_mem_pages,
         'snmp_retrans_segs_sec', snmp_retrans_segs_sec,
         'snmp_active_opens_sec', snmp_active_opens_sec,
         'snmp_passive_opens_sec', snmp_passive_opens_sec,
         'snmp_attempt_fails_delta', snmp_attempt_fails_delta,
         'snmp_estab_resets_delta', snmp_estab_resets_delta,
         'snmp_in_errs_delta', snmp_in_errs_delta,
         'snmp_out_rsts_delta', snmp_out_rsts_delta,
         'snmp_udp_rcvbuf_errors_delta', snmp_udp_rcvbuf_errors_delta,
         'snmp_udp_sndbuf_errors_delta', snmp_udp_sndbuf_errors_delta,
         'snmp_udp_in_errors_delta', snmp_udp_in_errors_delta,
         'netstat_listen_overflows_delta', netstat_listen_overflows_delta,
         'netstat_listen_drops_delta', netstat_listen_drops_delta,
         'netstat_tcp_timeouts_delta', netstat_tcp_timeouts_delta,
         'netstat_tcp_syn_retrans_delta', netstat_tcp_syn_retrans_delta,
         'netstat_tcp_fast_retrans_delta', netstat_tcp_fast_retrans_delta,
         'netstat_tcp_ofo_queue_delta', netstat_tcp_ofo_queue_delta,
         'netstat_tcp_abort_on_memory_delta', netstat_tcp_abort_on_memory_delta,
         'netstat_syncookies_sent_delta', netstat_syncookies_sent_delta,
         'softnet_processed_delta', softnet_processed_delta,
         'softnet_dropped_delta', softnet_dropped_delta,
         'softnet_time_squeeze_delta', softnet_time_squeeze_delta,
         'conntrack_count', conntrack_count,
         'conntrack_max', conntrack_max
       ) as ext_json
     FROM metrics_raw
     WHERE host_id = ? AND ts >= ? AND ts <= ?
     ORDER BY ts ASC`;

const HOURLY_SELECT_SQL = `SELECT hour_ts as ts, cpu_usage_avg as cpu_usage_pct, cpu_iowait_avg as cpu_iowait,
         cpu_steal_avg as cpu_steal, cpu_load1_avg as cpu_load1, cpu_load5_avg as cpu_load5,
         cpu_load15_avg as cpu_load15, NULL as cpu_count,
         mem_total, mem_available_min as mem_available, mem_used_pct_avg as mem_used_pct,
         swap_total, swap_used_max as swap_used, swap_used_pct_avg as swap_used_pct,
         disk_json, NULL as net_json,
         net_rx_bytes_avg, net_rx_bytes_max, net_tx_bytes_avg, net_tx_bytes_max,
         net_rx_errors, net_tx_errors,
         uptime_min as uptime_seconds, sample_count,
         psi_cpu_some_avg10_avg as psi_cpu_some_avg10,
         psi_cpu_some_avg60_avg as psi_cpu_some_avg60,
         NULL as psi_cpu_some_avg300,
         NULL as psi_mem_some_avg10,
         psi_mem_some_avg60_avg as psi_mem_some_avg60,
         NULL as psi_mem_some_avg300,
         NULL as psi_mem_full_avg10,
         psi_mem_full_avg60_avg as psi_mem_full_avg60,
         NULL as psi_mem_full_avg300,
         NULL as psi_io_some_avg10,
         psi_io_some_avg60_avg as psi_io_some_avg60,
         NULL as psi_io_some_avg300,
         NULL as psi_io_full_avg10,
         psi_io_full_avg60_avg as psi_io_full_avg60,
         NULL as psi_io_full_avg300,
         disk_io_json,
         tcp_established_avg as tcp_established,
         tcp_time_wait_avg as tcp_time_wait,
         tcp_orphan_avg as tcp_orphan,
         tcp_allocated_avg as tcp_allocated,
         context_switches_sec_avg as context_switches_sec,
         forks_sec_avg as forks_sec,
         procs_running_avg as procs_running,
         procs_blocked_avg as procs_blocked,
         oom_kills_sum as oom_kills,
         fd_allocated_avg as fd_allocated,
         fd_max,
         ext_json
       FROM metrics_hourly
       WHERE host_id = ? AND hour_ts >= ? AND hour_ts <= ?
       ORDER BY hour_ts ASC`;

const HOST_UPSERT_FIRST_SEEN_SQL = `INSERT INTO hosts (host_id, hostname, last_seen, top_processes_json, top_processes_ts)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(host_id) DO UPDATE SET
  last_seen = excluded.last_seen,
  top_processes_json = COALESCE(excluded.top_processes_json, hosts.top_processes_json),
  top_processes_ts = COALESCE(excluded.top_processes_ts, hosts.top_processes_ts)`;

const HOST_TOUCH_LAST_SEEN_SQL = `UPDATE hosts
SET last_seen = ?,
    top_processes_json = COALESCE(?, top_processes_json),
    top_processes_ts = COALESCE(?, top_processes_ts)
WHERE host_id = ?`;

export class D1MetricsRepository implements MetricsRepository {
	private readonly db: D1Database;

	constructor(db: D1Database) {
		this.db = db;
	}

	async queryRaw(hostId: string, from: number, to: number): Promise<MetricsRawRow[]> {
		const result = await this.db
			.prepare(RAW_SELECT_SQL)
			.bind(hostId, from, to)
			.all<MetricsRawRow>();
		return result.results;
	}

	async queryHourly(hostId: string, from: number, to: number): Promise<MetricsHourlyRow[]> {
		const result = await this.db
			.prepare(HOURLY_SELECT_SQL)
			.bind(hostId, from, to)
			.all<MetricsHourlyRow>();
		return result.results;
	}

	async insertRawWithHostUpsert(
		hostId: string,
		hostname: string,
		payload: MetricsPayload,
		nowSeconds: number,
		mode: "first-seen" | "existing" | "skip-host-touch",
	): Promise<{ inserted: boolean }> {
		const metricsStmt = buildInsertMetricsRawStatement(this.db, hostId, payload);
		const topProcessesJson = payload.top_processes ? JSON.stringify(payload.top_processes) : null;
		const topProcessesTs = topProcessesJson != null ? payload.timestamp : null;

		// "skip-host-touch": existing host whose last_seen was flushed recently
		// (KV decision in the route). The host row is guaranteed to exist, so
		// no FK risk and no host stmt is needed — only the metrics insert.
		// `top_processes_json` refresh is intentionally skipped on this path: a
		// 5min staleness window for the latest process list is invisible to
		// users and lets the throttle keep its zero-write semantics.
		if (mode === "skip-host-touch") {
			const result = await metricsStmt.run();
			const inserted = (result.meta?.changes ?? 0) > 0;
			return { inserted };
		}

		const hostStmt =
			mode === "first-seen"
				? this.db
						.prepare(HOST_UPSERT_FIRST_SEEN_SQL)
						.bind(hostId, hostname, nowSeconds, topProcessesJson, topProcessesTs)
				: this.db
						.prepare(HOST_TOUCH_LAST_SEEN_SQL)
						.bind(nowSeconds, topProcessesJson, topProcessesTs, hostId);

		// Order matters on the first-seen path: host row must exist before
		// metrics insert (FK). For existing hosts the host row is already
		// there, so order is irrelevant — but we keep host-first uniformly.
		const batchResults = await this.db.batch([hostStmt, metricsStmt]);
		const inserted = (batchResults[1]?.meta?.changes ?? 0) > 0;
		return { inserted };
	}
}
