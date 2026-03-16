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
         uptime_min as uptime_seconds, sample_count
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
       uptime_seconds
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
