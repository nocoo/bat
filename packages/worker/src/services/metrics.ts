// Metrics insertion service — flattens MetricsPayload to D1 row
import type { MetricsPayload } from "@bat/shared";

/** Build prepared statement for INSERT OR IGNORE into metrics_raw.
 *  Use with db.batch() for combined operations. */
export function buildInsertMetricsStmt(
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
   conntrack_count, conntrack_max,
   top_processes_json)
VALUES (${new Array(98).fill("?").join(", ")})`,
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
			// PSI (15 fields — null if probe doesn't send them)
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
			// Disk I/O (JSON array)
			payload.disk_io ? JSON.stringify(payload.disk_io) : null,
			// TCP
			payload.tcp?.established ?? null,
			payload.tcp?.time_wait ?? null,
			payload.tcp?.orphan ?? null,
			payload.tcp?.allocated ?? null,
			// CPU extensions
			payload.cpu.context_switches_sec ?? null,
			payload.cpu.forks_sec ?? null,
			payload.cpu.procs_running ?? null,
			payload.cpu.procs_blocked ?? null,
			// OOM kills
			payload.mem.oom_kills_delta ?? null,
			// File descriptors
			payload.fd?.allocated ?? null,
			payload.fd?.max ?? null,
			// --- Signal expansion fields ---
			// CPU extensions
			payload.cpu.interrupts_sec ?? null,
			payload.cpu.softirq_net_rx_sec ?? null,
			payload.cpu.softirq_block_sec ?? null,
			payload.cpu.tasks_running ?? null,
			payload.cpu.tasks_total ?? null,
			// Memory composition
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
			// VMstat rates
			payload.mem.swap_in_sec ?? null,
			payload.mem.swap_out_sec ?? null,
			payload.mem.pgmajfault_sec ?? null,
			payload.mem.pgpgin_sec ?? null,
			payload.mem.pgpgout_sec ?? null,
			// PSI total deltas
			payload.psi?.cpu_some_total_delta ?? null,
			payload.psi?.mem_some_total_delta ?? null,
			payload.psi?.mem_full_total_delta ?? null,
			payload.psi?.io_some_total_delta ?? null,
			payload.psi?.io_full_total_delta ?? null,
			// TCP memory
			payload.tcp?.mem_pages ?? null,
			// Socket / UDP
			payload.socket?.sockets_used ?? null,
			payload.udp?.inuse ?? null,
			payload.udp?.mem_pages ?? null,
			// SNMP
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
			// Netstat
			payload.netstat?.listen_overflows_delta ?? null,
			payload.netstat?.listen_drops_delta ?? null,
			payload.netstat?.tcp_timeouts_delta ?? null,
			payload.netstat?.tcp_syn_retrans_delta ?? null,
			payload.netstat?.tcp_fast_retrans_delta ?? null,
			payload.netstat?.tcp_ofo_queue_delta ?? null,
			payload.netstat?.tcp_abort_on_memory_delta ?? null,
			payload.netstat?.syncookies_sent_delta ?? null,
			// Softnet
			payload.softnet?.processed_delta ?? null,
			payload.softnet?.dropped_delta ?? null,
			payload.softnet?.time_squeeze_delta ?? null,
			// Conntrack
			payload.conntrack?.count ?? null,
			payload.conntrack?.max ?? null,
			// Top processes (JSON array)
			payload.top_processes ? JSON.stringify(payload.top_processes) : null,
		);
}

/** Insert a raw metrics row into metrics_raw, flattening nested fields.
 *  Uses INSERT OR IGNORE to silently skip duplicates from Probe retries.
 *  Returns true if a row was actually inserted, false if it was a duplicate. */
export async function insertMetricsRaw(
	db: D1Database,
	hostId: string,
	payload: MetricsPayload,
): Promise<boolean> {
	const result = await buildInsertMetricsStmt(db, hostId, payload).run();
	return result.meta.changes > 0;
}

/** Build prepared statement for ensuring host exists. */
export function buildEnsureHostStmt(
	db: D1Database,
	hostId: string,
	hostname: string,
	now: number,
): D1PreparedStatement {
	return db
		.prepare(
			`INSERT INTO hosts (host_id, hostname, last_seen)
VALUES (?, ?, ?)
ON CONFLICT(host_id) DO NOTHING`,
		)
		.bind(hostId, hostname, now);
}

/** Ensure host record exists (FK target for metrics_raw) without updating last_seen.
 *  If the host already exists, this is a no-op. */
export async function ensureHostExists(
	db: D1Database,
	hostId: string,
	hostname: string,
	now: number,
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO hosts (host_id, hostname, last_seen)
VALUES (?, ?, ?)
ON CONFLICT(host_id) DO NOTHING`,
		)
		.bind(hostId, hostname, now)
		.run();
}

/** Build prepared statement for updating host last_seen. */
export function buildUpdateLastSeenStmt(
	db: D1Database,
	hostId: string,
	now: number,
): D1PreparedStatement {
	return db.prepare("UPDATE hosts SET last_seen = ? WHERE host_id = ?").bind(now, hostId);
}

/** Update host last_seen timestamp. Called only when new metrics are actually inserted. */
export async function updateHostLastSeen(
	db: D1Database,
	hostId: string,
	now: number,
): Promise<void> {
	await db.prepare("UPDATE hosts SET last_seen = ? WHERE host_id = ?").bind(now, hostId).run();
}
