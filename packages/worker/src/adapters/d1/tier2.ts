// D1-backed Tier2Repository. SQL lifted verbatim from
// `services/tier2-metrics.ts` (insertTier2Snapshot + getLatestTier2Snapshot
// + rowToTier2Snapshot pure shaper). C8 may further consolidate these,
// but for C4 we move the DB-touching SQL behind the repo while keeping
// the pure shaper available to existing tests via a re-export.

import type { Tier2Payload, Tier2Snapshot } from "@bat/shared";
import { safeParse } from "../../lib/json-helpers.js";
import type { Tier2Repository } from "../../repos/types.js";

export interface Tier2Row {
	host_id: string;
	ts: number;
	ports_json: string | null;
	systemd_json: string | null;
	security_json: string | null;
	docker_json: string | null;
	disk_deep_json: string | null;
	software_json: string | null;
	websites_json: string | null;
	timezone: string | null;
	dns_resolvers_json: string | null;
	dns_search_json: string | null;
}

/**
 * Pure shaper: parse the JSON columns of a `tier2_snapshots` row (joined
 * with hosts) into a `Tier2Snapshot`. Exported so the existing
 * `services/tier2-metrics.test.ts` keeps testing the shape without
 * touching the DB layer.
 */
export function rowToTier2Snapshot(row: Tier2Row): Tier2Snapshot {
	return {
		host_id: row.host_id,
		ts: row.ts,
		ports: safeParse(row.ports_json),
		systemd: safeParse(row.systemd_json),
		security: safeParse(row.security_json),
		docker: safeParse(row.docker_json),
		disk_deep: safeParse(row.disk_deep_json),
		software: safeParse(row.software_json),
		websites: safeParse(row.websites_json),
		timezone: row.timezone ?? null,
		dns_resolvers: safeParse(row.dns_resolvers_json),
		dns_search: safeParse(row.dns_search_json),
	};
}

export class D1Tier2Repository implements Tier2Repository {
	private readonly db: D1Database;

	constructor(db: D1Database) {
		this.db = db;
	}

	async insertSnapshot(hostId: string, payload: Tier2Payload): Promise<boolean> {
		const result = await this.db
			.prepare(
				`INSERT OR IGNORE INTO tier2_snapshots
  (host_id, ts, ports_json, systemd_json, security_json, docker_json, disk_deep_json, software_json, websites_json)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				hostId,
				payload.timestamp,
				payload.ports ? JSON.stringify(payload.ports) : null,
				payload.systemd ? JSON.stringify(payload.systemd) : null,
				payload.security ? JSON.stringify(payload.security) : null,
				payload.docker ? JSON.stringify(payload.docker) : null,
				payload.disk_deep ? JSON.stringify(payload.disk_deep) : null,
				payload.software ? JSON.stringify(payload.software) : null,
				payload.websites ? JSON.stringify(payload.websites) : null,
			)
			.run();
		return result.meta.changes > 0;
	}

	async getLatestForHost(hostId: string): Promise<Tier2Snapshot | null> {
		// disk_deep_json uses latest-non-null semantics: the probe only sends
		// disk_deep every 6h, but light collections run every 30min with
		// disk_deep=null. Without COALESCE, the latest row's null would hide
		// the 6h-old scan result.
		const row = await this.db
			.prepare(
				`SELECT t.host_id, t.ts, t.ports_json, t.systemd_json,
       t.security_json, t.docker_json,
       COALESCE(t.disk_deep_json, (
         SELECT t2.disk_deep_json FROM tier2_snapshots t2
         WHERE t2.host_id = t.host_id AND t2.disk_deep_json IS NOT NULL
         ORDER BY t2.ts DESC LIMIT 1
       )) AS disk_deep_json,
       t.software_json, t.websites_json,
       h.timezone, h.dns_resolvers AS dns_resolvers_json, h.dns_search AS dns_search_json
FROM tier2_snapshots t
JOIN hosts h ON h.host_id = t.host_id
WHERE t.host_id = ?
ORDER BY t.ts DESC
LIMIT 1`,
			)
			.bind(hostId)
			.first<Tier2Row>();

		if (!row) {
			return null;
		}
		return rowToTier2Snapshot(row);
	}
}
