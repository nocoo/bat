// D1-backed HostsRepository. SQL lifted verbatim from
// `routes/{hosts,host-detail,monitoring,live,fleet-status}.ts` and
// `lib/resolve-host.ts`. Pure status / sparkline derivation stays in
// the routes (which still own the wire-DTO shape) or in `services/`.

import type {
	HostDetailRow,
	HostLatestMetricsRow,
	HostOverviewRow,
	HostSparklineRow,
	HostStatusRow,
	HostsRepository,
} from "../../repos/types.js";

const HOST_OVERVIEW_COLUMNS =
	"host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, cpu_logical, cpu_physical, mem_total_bytes, virtualization, public_ip, probe_version, maintenance_start, maintenance_end, maintenance_reason";

const HOST_STATUS_COLUMNS = "host_id, hostname, last_seen, maintenance_start, maintenance_end";

const HOST_DETAIL_COLUMNS =
	"host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, probe_version, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization, net_interfaces, disks, boot_mode, timezone, dns_resolvers, dns_search, public_ip, description, maintenance_start, maintenance_end, maintenance_reason";

const LATEST_METRICS_COLUMNS =
	"cpu_usage_pct, mem_used_pct, uptime_seconds, cpu_load1, swap_used_pct, disk_json, net_json";

export class D1HostsRepository implements HostsRepository {
	private readonly db: D1Database;

	constructor(db: D1Database) {
		this.db = db;
	}

	async probe(): Promise<void> {
		await this.db.prepare("SELECT 1 AS probe").first();
	}

	async listActiveHostIds(): Promise<{ host_id: string }[]> {
		const result = await this.db
			.prepare("SELECT host_id FROM hosts WHERE is_active = 1")
			.all<{ host_id: string }>();
		return result.results;
	}

	async listAllHostIdsWithActive(): Promise<{ host_id: string; is_active: number }[]> {
		const result = await this.db
			.prepare("SELECT host_id, is_active FROM hosts")
			.all<{ host_id: string; is_active: number }>();
		return result.results;
	}

	async getActiveFlag(hostId: string): Promise<{ host_id: string; is_active: number } | null> {
		return this.db
			.prepare("SELECT host_id, is_active FROM hosts WHERE host_id = ?")
			.bind(hostId)
			.first<{ host_id: string; is_active: number }>();
	}

	async listOverviewRows(): Promise<HostOverviewRow[]> {
		const result = await this.db
			.prepare(`SELECT ${HOST_OVERVIEW_COLUMNS} FROM hosts WHERE is_active = 1`)
			.all<HostOverviewRow>();
		return result.results;
	}

	async listStatusRows(): Promise<HostStatusRow[]> {
		const result = await this.db
			.prepare(`SELECT ${HOST_STATUS_COLUMNS} FROM hosts WHERE is_active = 1`)
			.all<HostStatusRow>();
		return result.results;
	}

	async getDetailRow(hostId: string): Promise<HostDetailRow | null> {
		return this.db
			.prepare(`SELECT ${HOST_DETAIL_COLUMNS} FROM hosts WHERE host_id = ? AND is_active = 1`)
			.bind(hostId)
			.first<HostDetailRow>();
	}

	async getStatusRow(hostId: string): Promise<HostStatusRow | null> {
		return this.db
			.prepare(`SELECT ${HOST_STATUS_COLUMNS} FROM hosts WHERE host_id = ? AND is_active = 1`)
			.bind(hostId)
			.first<HostStatusRow>();
	}

	async getLatestMetricsBatch(hostIds: string[]): Promise<HostLatestMetricsRow[]> {
		if (hostIds.length === 0) {
			return [];
		}
		// Per-host LIMIT 1 queries to leverage (host_id, ts) index — avoids
		// a full table scan that an `IN (...)` over metrics_raw would trigger.
		const queries = hostIds.map((hostId) =>
			this.db
				.prepare(
					`SELECT host_id, ${LATEST_METRICS_COLUMNS} FROM metrics_raw WHERE host_id = ? ORDER BY ts DESC LIMIT 1`,
				)
				.bind(hostId),
		);
		const results = await this.db.batch(queries);
		const rows: HostLatestMetricsRow[] = [];
		for (const result of results) {
			const row = result.results?.[0] as HostLatestMetricsRow | undefined;
			if (row) {
				rows.push(row);
			}
		}
		return rows;
	}

	async getLatestUptime(hostId: string): Promise<number | null> {
		const row = await this.db
			.prepare("SELECT uptime_seconds FROM metrics_raw WHERE host_id = ? ORDER BY ts DESC LIMIT 1")
			.bind(hostId)
			.first<{ uptime_seconds: number | null }>();
		return row?.uptime_seconds ?? null;
	}

	async listSparklineRowsSince(
		hostIds: string[],
		sinceSeconds: number,
	): Promise<HostSparklineRow[]> {
		if (hostIds.length === 0) {
			return [];
		}
		const placeholders = hostIds.map(() => "?").join(", ");
		const result = await this.db
			.prepare(
				`SELECT host_id, hour_ts as ts, cpu_usage_avg as cpu, mem_used_pct_avg as mem,
	CASE WHEN net_rx_bytes_avg IS NOT NULL AND net_tx_bytes_avg IS NOT NULL
		THEN net_rx_bytes_avg + net_tx_bytes_avg ELSE NULL END as net
FROM metrics_hourly
WHERE host_id IN (${placeholders}) AND hour_ts >= ?
ORDER BY host_id, hour_ts ASC`,
			)
			.bind(...hostIds, sinceSeconds)
			.all<HostSparklineRow>();
		return result.results;
	}
}
