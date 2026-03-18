// GET /api/hosts/:id/metrics — query metrics with auto resolution
// :id accepts either raw host_id or opaque hid (8-char hash)
import type { MetricsDataPoint, MetricsQueryResponse } from "@bat/shared";
import { AUTO_RESOLUTION_THRESHOLD_SECONDS, hashHostId } from "@bat/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";

/**
 * Resolve the route param to a real host_id.
 * If `id` is an 8-char hex hid, scan active hosts to find the match.
 * Otherwise assume it's a raw host_id.
 */
async function resolveHostId(db: D1Database, id: string): Promise<string | null> {
	const isHid = /^[0-9a-f]{8}$/.test(id);
	if (!isHid) return id;

	// Scan active hosts and match by hash
	const result = await db
		.prepare("SELECT host_id FROM hosts WHERE is_active = 1")
		.all<{ host_id: string }>();
	for (const row of result.results) {
		if (hashHostId(row.host_id) === id) return row.host_id;
	}
	return null;
}

export async function hostMetricsRoute(c: Context<AppEnv, "/api/hosts/:id/metrics">) {
	const idParam = c.req.param("id");
	const fromStr = c.req.query("from");
	const toStr = c.req.query("to");

	if (!fromStr || !toStr) {
		return c.json({ error: "Missing required query params: from, to" }, 400);
	}

	const from = Number(fromStr);
	const to = Number(toStr);

	if (Number.isNaN(from) || Number.isNaN(to)) {
		return c.json({ error: "from and to must be valid numbers" }, 400);
	}

	const db = c.env.DB;

	const hostId = await resolveHostId(db, idParam);
	if (!hostId) {
		return c.json({ error: "Host not found" }, 404);
	}

	const range = to - from;
	const useHourly = range > AUTO_RESOLUTION_THRESHOLD_SECONDS;

	if (useHourly) {
		// Query hourly aggregated data
		const result = await db
			.prepare(
				`SELECT hour_ts as ts, cpu_usage_avg as cpu_usage_pct, cpu_iowait_avg as cpu_iowait,
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
         interrupts_sec_avg as interrupts_sec,
         softirq_net_rx_sec_avg as softirq_net_rx_sec,
         softirq_block_sec_avg as softirq_block_sec,
         tasks_running_avg as tasks_running,
         tasks_total_avg as tasks_total,
         mem_buffers_avg as mem_buffers,
         mem_cached_avg as mem_cached,
         mem_dirty_avg as mem_dirty,
         mem_writeback_avg as mem_writeback,
         mem_shmem_avg as mem_shmem,
         mem_slab_reclaimable_avg as mem_slab_reclaimable,
         mem_slab_unreclaim_avg as mem_slab_unreclaim,
         mem_committed_as_avg as mem_committed_as,
         mem_commit_limit,
         mem_hw_corrupted_max as mem_hw_corrupted,
         swap_in_sec_avg as swap_in_sec,
         swap_out_sec_avg as swap_out_sec,
         pgmajfault_sec_avg as pgmajfault_sec,
         pgpgin_sec_avg as pgpgin_sec,
         pgpgout_sec_avg as pgpgout_sec,
         psi_cpu_some_total_delta_sum as psi_cpu_some_total_delta,
         psi_mem_some_total_delta_sum as psi_mem_some_total_delta,
         psi_mem_full_total_delta_sum as psi_mem_full_total_delta,
         psi_io_some_total_delta_sum as psi_io_some_total_delta,
         psi_io_full_total_delta_sum as psi_io_full_total_delta,
         tcp_mem_pages_avg as tcp_mem_pages,
         sockets_used_avg as sockets_used,
         udp_inuse_avg as udp_inuse,
         udp_mem_pages_avg as udp_mem_pages,
         snmp_retrans_segs_sec_avg as snmp_retrans_segs_sec,
         snmp_active_opens_sec_avg as snmp_active_opens_sec,
         snmp_passive_opens_sec_avg as snmp_passive_opens_sec,
         snmp_attempt_fails_delta_sum as snmp_attempt_fails_delta,
         snmp_estab_resets_delta_sum as snmp_estab_resets_delta,
         snmp_in_errs_delta_sum as snmp_in_errs_delta,
         snmp_out_rsts_delta_sum as snmp_out_rsts_delta,
         snmp_udp_rcvbuf_errors_delta_sum as snmp_udp_rcvbuf_errors_delta,
         snmp_udp_sndbuf_errors_delta_sum as snmp_udp_sndbuf_errors_delta,
         snmp_udp_in_errors_delta_sum as snmp_udp_in_errors_delta,
         netstat_listen_overflows_delta_sum as netstat_listen_overflows_delta,
         netstat_listen_drops_delta_sum as netstat_listen_drops_delta,
         netstat_tcp_timeouts_delta_sum as netstat_tcp_timeouts_delta,
         netstat_tcp_syn_retrans_delta_sum as netstat_tcp_syn_retrans_delta,
         netstat_tcp_fast_retrans_delta_sum as netstat_tcp_fast_retrans_delta,
         netstat_tcp_ofo_queue_delta_sum as netstat_tcp_ofo_queue_delta,
         netstat_tcp_abort_on_memory_delta_sum as netstat_tcp_abort_on_memory_delta,
         netstat_syncookies_sent_delta_sum as netstat_syncookies_sent_delta,
         softnet_processed_delta_sum as softnet_processed_delta,
         softnet_dropped_delta_sum as softnet_dropped_delta,
         softnet_time_squeeze_delta_sum as softnet_time_squeeze_delta,
         conntrack_count_avg as conntrack_count,
         conntrack_max
       FROM metrics_hourly
       WHERE host_id = ? AND hour_ts >= ? AND hour_ts <= ?
       ORDER BY hour_ts ASC`,
			)
			.bind(hostId, from, to)
			.all<MetricsDataPoint>();

		const response: MetricsQueryResponse = {
			host_id: hostId,
			resolution: "hourly",
			from,
			to,
			data: result.results,
		};
		return c.json(response);
	}

	// Query raw data
	const result = await db
		.prepare(
			`SELECT ts, cpu_usage_pct, cpu_iowait, cpu_steal, cpu_load1, cpu_load5, cpu_load15,
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
       interrupts_sec, softirq_net_rx_sec, softirq_block_sec,
       tasks_running, tasks_total,
       mem_buffers, mem_cached, mem_dirty, mem_writeback, mem_shmem,
       mem_slab_reclaimable, mem_slab_unreclaim,
       mem_committed_as, mem_commit_limit, mem_hw_corrupted,
       swap_in_sec, swap_out_sec, pgmajfault_sec, pgpgin_sec, pgpgout_sec,
       psi_cpu_some_total_delta, psi_mem_some_total_delta, psi_mem_full_total_delta,
       psi_io_some_total_delta, psi_io_full_total_delta,
       tcp_mem_pages, sockets_used, udp_inuse, udp_mem_pages,
       snmp_retrans_segs_sec, snmp_active_opens_sec, snmp_passive_opens_sec,
       snmp_attempt_fails_delta, snmp_estab_resets_delta,
       snmp_in_errs_delta, snmp_out_rsts_delta,
       snmp_udp_rcvbuf_errors_delta, snmp_udp_sndbuf_errors_delta, snmp_udp_in_errors_delta,
       netstat_listen_overflows_delta, netstat_listen_drops_delta,
       netstat_tcp_timeouts_delta, netstat_tcp_syn_retrans_delta,
       netstat_tcp_fast_retrans_delta, netstat_tcp_ofo_queue_delta,
       netstat_tcp_abort_on_memory_delta, netstat_syncookies_sent_delta,
       softnet_processed_delta, softnet_dropped_delta, softnet_time_squeeze_delta,
       conntrack_count, conntrack_max
     FROM metrics_raw
     WHERE host_id = ? AND ts >= ? AND ts <= ?
     ORDER BY ts ASC`,
		)
		.bind(hostId, from, to)
		.all<MetricsDataPoint>();

	const response: MetricsQueryResponse = {
		host_id: hostId,
		resolution: "raw",
		from,
		to,
		data: result.results,
	};
	return c.json(response);
}
