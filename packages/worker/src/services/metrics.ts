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
   disk_json, net_json, uptime_seconds,
   psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
   psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
   psi_mem_full_avg10, psi_mem_full_avg60, psi_mem_full_avg300,
   psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
   psi_io_full_avg10, psi_io_full_avg60, psi_io_full_avg300,
   disk_io_json,
   tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated,
   context_switches_sec, forks_sec, procs_running, procs_blocked,
   oom_kills, fd_allocated, fd_max)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
