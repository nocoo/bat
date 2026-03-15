// Metrics insertion service — flattens MetricsPayload to D1 row
import type { MetricsPayload } from "@bat/shared";

/** Insert a raw metrics row into metrics_raw, flattening nested fields.
 *  Uses INSERT OR IGNORE to silently skip duplicates from Probe retries.
 *  Returns true if a row was actually inserted, false if it was a duplicate. */
export async function insertMetricsRaw(
	db: D1Database,
	hostId: string,
	payload: MetricsPayload,
): Promise<boolean> {
	const result = await db
		.prepare(
			`INSERT OR IGNORE INTO metrics_raw
  (host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal, cpu_count,
   mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
   disk_json, net_json, uptime_seconds)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
		)
		.run();
	return result.meta.changes > 0;
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

/** Update host last_seen timestamp. Called only when new metrics are actually inserted. */
export async function updateHostLastSeen(
	db: D1Database,
	hostId: string,
	now: number,
): Promise<void> {
	await db.prepare("UPDATE hosts SET last_seen = ? WHERE host_id = ?").bind(now, hostId).run();
}
