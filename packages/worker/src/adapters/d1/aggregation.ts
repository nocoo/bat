// D1-backed AggregationRepository. Owns all hourly-aggregation and
// retention-purge SQL. Pure number-crunching helpers live in
// `domain/aggregation.ts`; this module composes them into the per-host
// INSERT … ON CONFLICT statement.

import type { RetentionDays } from "@bat/shared";
import {
	aggregateDiskIo,
	aggregateNetwork,
	avg,
	avgNullable,
	buildExtJson,
	max,
	maxNullable,
	min,
	type RawRow,
	sumNullable,
} from "../../domain/aggregation.js";
import type { AggregationRepository } from "../../repos/types.js";
import { D1SettingsRepository } from "./settings.js";

const RAW_COLUMNS_SELECT = `cpu_usage_pct, cpu_iowait, cpu_steal, cpu_load1, cpu_load5, cpu_load15,
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
       conntrack_count, conntrack_max`;

const HOURLY_INSERT_SQL = `INSERT INTO metrics_hourly (
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
  ext_json = excluded.ext_json`;

export class D1AggregationRepository implements AggregationRepository {
	private readonly db: D1Database;

	constructor(db: D1Database) {
		this.db = db;
	}

	async aggregateHour(hourTs: number): Promise<void> {
		const hourEnd = hourTs + 3600;

		// Get all active hosts that have raw data in this hour
		const hostsResult = await this.db
			.prepare(
				`SELECT DISTINCT mr.host_id
FROM metrics_raw mr
JOIN hosts h ON mr.host_id = h.host_id
WHERE h.is_active = 1 AND mr.ts >= ? AND mr.ts < ?`,
			)
			.bind(hourTs, hourEnd)
			.all<{ host_id: string }>();

		for (const { host_id } of hostsResult.results) {
			await this.aggregateHostHour(host_id, hourTs, hourEnd);
		}
	}

	private async aggregateHostHour(hostId: string, hourTs: number, hourEnd: number): Promise<void> {
		const rawResult = await this.db
			.prepare(
				`SELECT ${RAW_COLUMNS_SELECT}
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
		const lastRow = rows[rows.length - 1] as RawRow;

		const cpuUsageAvg = avg(rows.map((r) => r.cpu_usage_pct));
		const cpuUsageMax = max(rows.map((r) => r.cpu_usage_pct));
		const cpuIowaitAvg = avg(rows.map((r) => r.cpu_iowait));
		const cpuStealAvg = avg(rows.map((r) => r.cpu_steal));
		const cpuLoad1Avg = avg(rows.map((r) => r.cpu_load1));
		const cpuLoad5Avg = avg(rows.map((r) => r.cpu_load5));
		const cpuLoad15Avg = avg(rows.map((r) => r.cpu_load15));

		const memTotal = lastRow.mem_total;
		const memAvailableMin = min(rows.map((r) => r.mem_available));
		const memUsedPctAvg = avg(rows.map((r) => r.mem_used_pct));
		const memUsedPctMax = max(rows.map((r) => r.mem_used_pct));

		const swapTotal = lastRow.swap_total;
		const swapUsedMax = max(rows.map((r) => r.swap_used));
		const swapUsedPctAvg = avg(rows.map((r) => r.swap_used_pct));
		const swapUsedPctMax = max(rows.map((r) => r.swap_used_pct));

		const uptimeMin = min(rows.map((r) => r.uptime_seconds));

		const diskJson = lastRow.disk_json;
		const netAgg = aggregateNetwork(rows);

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

		const diskIoJson = aggregateDiskIo(rows);

		const tcpEstablishedAvg = avgNullable(rows.map((r) => r.tcp_established));
		const tcpEstablishedMax = maxNullable(rows.map((r) => r.tcp_established));
		const tcpTimeWaitAvg = avgNullable(rows.map((r) => r.tcp_time_wait));
		const tcpTimeWaitMax = maxNullable(rows.map((r) => r.tcp_time_wait));
		const tcpOrphanAvg = avgNullable(rows.map((r) => r.tcp_orphan));
		const tcpOrphanMax = maxNullable(rows.map((r) => r.tcp_orphan));
		const tcpAllocatedAvg = avgNullable(rows.map((r) => r.tcp_allocated));
		const tcpAllocatedMax = maxNullable(rows.map((r) => r.tcp_allocated));

		const ctxSwitchAvg = avgNullable(rows.map((r) => r.context_switches_sec));
		const ctxSwitchMax = maxNullable(rows.map((r) => r.context_switches_sec));
		const forksAvg = avgNullable(rows.map((r) => r.forks_sec));
		const forksMax = maxNullable(rows.map((r) => r.forks_sec));
		const procsRunAvg = avgNullable(rows.map((r) => r.procs_running));
		const procsRunMax = maxNullable(rows.map((r) => r.procs_running));
		const procsBlkAvg = avgNullable(rows.map((r) => r.procs_blocked));
		const procsBlkMax = maxNullable(rows.map((r) => r.procs_blocked));

		const oomKillsSum = sumNullable(rows.map((r) => r.oom_kills));

		const fdAllocatedAvg = avgNullable(rows.map((r) => r.fd_allocated));
		const fdAllocatedMax = maxNullable(rows.map((r) => r.fd_allocated));
		const fdMaxLast = lastRow.fd_max;

		const ext = buildExtJson(rows);
		const extJson = ext !== null ? JSON.stringify(ext) : null;

		await this.db
			.prepare(HOURLY_INSERT_SQL)
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
	 * Purge old data beyond retention window. Unified semantics: all
	 * tables use the same retentionDays cutoff.
	 */
	async purgeOldData(nowSeconds: number, retentionDays: RetentionDays): Promise<void> {
		const cutoff = nowSeconds - retentionDays * 86400;
		await this.db.prepare("DELETE FROM metrics_raw WHERE ts < ?").bind(cutoff).run();
		await this.db.prepare("DELETE FROM metrics_hourly WHERE hour_ts < ?").bind(cutoff).run();
		await this.db.prepare("DELETE FROM tier2_snapshots WHERE ts < ?").bind(cutoff).run();
		await this.db.prepare("DELETE FROM events WHERE created_at < ?").bind(cutoff).run();
	}

	/**
	 * Scheduled maintenance entry point. Reads retention_days from settings,
	 * then purges old data.
	 */
	async runScheduledMaintenance(nowSeconds: number): Promise<void> {
		const retentionDays = await new D1SettingsRepository(this.db).getRetentionDays();
		await this.purgeOldData(nowSeconds, retentionDays);
	}
}
