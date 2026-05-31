// D1-backed MaintenanceRepository. SQL lifted verbatim from
// `routes/maintenance.ts` (the SELECT + UPDATE statements that touch
// hosts.maintenance_*). Host id resolution (hid → host_id) still lives
// in `lib/resolve-host.ts`; callers pass an already-resolved host_id.

import { invalidateHostMeta } from "../../lib/host-meta-cache.js";
import type { MaintenanceRepository, MaintenanceWindow } from "../../repos/types.js";

export class D1MaintenanceRepository implements MaintenanceRepository {
	private readonly db: D1Database;

	constructor(db: D1Database) {
		this.db = db;
	}

	async getForHost(hostId: string): Promise<MaintenanceWindow | null> {
		const row = await this.db
			.prepare(
				"SELECT maintenance_start, maintenance_end, maintenance_reason FROM hosts WHERE host_id = ?",
			)
			.bind(hostId)
			.first<{
				maintenance_start: string | null;
				maintenance_end: string | null;
				maintenance_reason: string | null;
			}>();
		if (!(row?.maintenance_start && row?.maintenance_end)) {
			return null;
		}
		return {
			start: row.maintenance_start,
			end: row.maintenance_end,
			reason: row.maintenance_reason,
		};
	}

	async setForHost(
		hostId: string,
		window: MaintenanceWindow,
		opts?: { kv?: KVNamespace | undefined },
	): Promise<void> {
		await this.db
			.prepare(
				"UPDATE hosts SET maintenance_start = ?, maintenance_end = ?, maintenance_reason = ? WHERE host_id = ?",
			)
			.bind(window.start, window.end, window.reason, hostId)
			.run();
		await invalidateHostMeta(opts?.kv, hostId);
	}

	async clearForHost(hostId: string, opts?: { kv?: KVNamespace | undefined }): Promise<void> {
		await this.db
			.prepare(
				"UPDATE hosts SET maintenance_start = NULL, maintenance_end = NULL, maintenance_reason = NULL WHERE host_id = ?",
			)
			.bind(hostId)
			.run();
		await invalidateHostMeta(opts?.kv, hostId);
	}
}
