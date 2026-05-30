// GET /api/hosts/:id/metrics — query metrics with auto resolution
// :id accepts either raw host_id or opaque hid (8-char hash)
import type { MetricsDataPoint, MetricsQueryResponse } from "@bat/shared";
import { AUTO_RESOLUTION_THRESHOLD_SECONDS } from "@bat/shared";
import type { Context } from "hono";
import { resolveHostIdByHash } from "../lib/resolve-host.js";
import type { AppEnv } from "../types.js";

/**
 * Parse the `from` / `to` query-string pair for a metrics range.
 * Pure: returns `{ ok: true, from, to }` on success, otherwise an error.
 */
export type MetricsRangeResult =
	| { ok: true; from: number; to: number }
	| { ok: false; error: string };

export function parseMetricsRange(
	fromStr: string | undefined,
	toStr: string | undefined,
): MetricsRangeResult {
	if (!(fromStr && toStr)) {
		return { ok: false, error: "Missing required query params: from, to" };
	}
	const from = Number(fromStr);
	const to = Number(toStr);
	if (Number.isNaN(from) || Number.isNaN(to)) {
		return { ok: false, error: "from and to must be valid numbers" };
	}
	return { ok: true, from, to };
}

export async function hostMetricsRoute(c: Context<AppEnv, "/api/hosts/:id/metrics">) {
	const idParam = c.req.param("id");
	const parsedRange = parseMetricsRange(c.req.query("from"), c.req.query("to"));
	if (!parsedRange.ok) {
		return c.json({ error: parsedRange.error }, 400);
	}
	const { from, to } = parsedRange;

	const repos = c.var.repos;

	const hostId = await resolveHostIdByHash(repos.hosts, idParam);
	if (!hostId) {
		return c.json({ error: "Host not found" }, 404);
	}

	const useHourly = to - from > AUTO_RESOLUTION_THRESHOLD_SECONDS;

	if (useHourly) {
		const rows = await repos.metrics.queryHourly(hostId, from, to);
		const data: MetricsDataPoint[] = rows.map(expandHourlyRow);
		const response: MetricsQueryResponse = {
			host_id: hostId,
			resolution: "hourly",
			from,
			to,
			data,
		};
		return c.json(response);
	}

	const rows = await repos.metrics.queryRaw(hostId, from, to);
	const data: MetricsDataPoint[] = rows.map(expandRawRow);

	const response: MetricsQueryResponse = {
		host_id: hostId,
		resolution: "raw",
		from,
		to,
		data,
	};
	return c.json(response);
}

// --- ext_json unpacking for both raw and hourly queries ---

/** Row from metrics_raw with signal expansion packed as ext_json */
export interface RawRow extends Record<string, unknown> {
	ext_json: string | null;
}

/** Hourly row as returned by SQL (includes ext_json as a TEXT column) */
export interface HourlyRow extends Record<string, unknown> {
	ext_json: string | null;
}

/**
 * Map from ext_json key (aggregation column name) to MetricsDataPoint field name.
 * Most use the _avg variant as the representative value for hourly resolution.
 */
export const EXT_KEY_MAP: Record<string, string> = {
	interrupts_sec_avg: "interrupts_sec",
	softirq_net_rx_sec_avg: "softirq_net_rx_sec",
	softirq_block_sec_avg: "softirq_block_sec",
	tasks_running_avg: "tasks_running",
	tasks_total_avg: "tasks_total",
	mem_buffers_avg: "mem_buffers",
	mem_cached_avg: "mem_cached",
	mem_dirty_avg: "mem_dirty",
	mem_writeback_avg: "mem_writeback",
	mem_shmem_avg: "mem_shmem",
	mem_slab_reclaimable_avg: "mem_slab_reclaimable",
	mem_slab_unreclaim_avg: "mem_slab_unreclaim",
	mem_committed_as_avg: "mem_committed_as",
	mem_commit_limit: "mem_commit_limit",
	mem_hw_corrupted_max: "mem_hw_corrupted",
	swap_in_sec_avg: "swap_in_sec",
	swap_out_sec_avg: "swap_out_sec",
	pgmajfault_sec_avg: "pgmajfault_sec",
	pgpgin_sec_avg: "pgpgin_sec",
	pgpgout_sec_avg: "pgpgout_sec",
	psi_cpu_some_total_delta_sum: "psi_cpu_some_total_delta",
	psi_mem_some_total_delta_sum: "psi_mem_some_total_delta",
	psi_mem_full_total_delta_sum: "psi_mem_full_total_delta",
	psi_io_some_total_delta_sum: "psi_io_some_total_delta",
	psi_io_full_total_delta_sum: "psi_io_full_total_delta",
	tcp_mem_pages_avg: "tcp_mem_pages",
	sockets_used_avg: "sockets_used",
	udp_inuse_avg: "udp_inuse",
	udp_mem_pages_avg: "udp_mem_pages",
	snmp_retrans_segs_sec_avg: "snmp_retrans_segs_sec",
	snmp_active_opens_sec_avg: "snmp_active_opens_sec",
	snmp_passive_opens_sec_avg: "snmp_passive_opens_sec",
	snmp_attempt_fails_delta_sum: "snmp_attempt_fails_delta",
	snmp_estab_resets_delta_sum: "snmp_estab_resets_delta",
	snmp_in_errs_delta_sum: "snmp_in_errs_delta",
	snmp_out_rsts_delta_sum: "snmp_out_rsts_delta",
	snmp_udp_rcvbuf_errors_delta_sum: "snmp_udp_rcvbuf_errors_delta",
	snmp_udp_sndbuf_errors_delta_sum: "snmp_udp_sndbuf_errors_delta",
	snmp_udp_in_errors_delta_sum: "snmp_udp_in_errors_delta",
	netstat_listen_overflows_delta_sum: "netstat_listen_overflows_delta",
	netstat_listen_drops_delta_sum: "netstat_listen_drops_delta",
	netstat_tcp_timeouts_delta_sum: "netstat_tcp_timeouts_delta",
	netstat_tcp_syn_retrans_delta_sum: "netstat_tcp_syn_retrans_delta",
	netstat_tcp_fast_retrans_delta_sum: "netstat_tcp_fast_retrans_delta",
	netstat_tcp_ofo_queue_delta_sum: "netstat_tcp_ofo_queue_delta",
	netstat_tcp_abort_on_memory_delta_sum: "netstat_tcp_abort_on_memory_delta",
	netstat_syncookies_sent_delta_sum: "netstat_syncookies_sent_delta",
	softnet_processed_delta_sum: "softnet_processed_delta",
	softnet_dropped_delta_sum: "softnet_dropped_delta",
	softnet_time_squeeze_delta_sum: "softnet_time_squeeze_delta",
	conntrack_count_avg: "conntrack_count",
	conntrack_max: "conntrack_max",
};

/** Expand a RawRow into a flat MetricsDataPoint by unpacking ext_json.
 * For raw rows, ext_json keys map directly to MetricsDataPoint field names. */
export function expandRawRow(row: RawRow): MetricsDataPoint {
	const { ext_json, ...base } = row;
	const result: Record<string, unknown> = { ...base };

	if (ext_json) {
		try {
			const ext = JSON.parse(ext_json) as Record<string, number | null>;
			for (const [key, value] of Object.entries(ext)) {
				result[key] = value;
			}
		} catch {
			// Bad JSON — leave ext fields absent
		}
	}

	return result as unknown as MetricsDataPoint;
}

/** Expand a HourlyRow into a flat MetricsDataPoint by unpacking ext_json. */
export function expandHourlyRow(row: HourlyRow): MetricsDataPoint {
	// Start with all base columns (excluding ext_json)
	const { ext_json, ...base } = row;
	const result: Record<string, unknown> = { ...base };

	// Set all ext fields to null by default
	for (const field of Object.values(EXT_KEY_MAP)) {
		result[field] = null;
	}

	// Unpack ext_json if present
	if (ext_json) {
		try {
			const ext = JSON.parse(ext_json) as Record<string, number | null>;
			for (const [extKey, dpKey] of Object.entries(EXT_KEY_MAP)) {
				if (ext[extKey] !== undefined) {
					result[dpKey] = ext[extKey];
				}
			}
		} catch {
			// Bad JSON — leave all ext fields as null
		}
	}

	return result as unknown as MetricsDataPoint;
}
