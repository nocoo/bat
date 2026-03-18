// Tier 2 metrics insertion and query service
import type { Tier2Payload, Tier2Snapshot } from "@bat/shared";

/** Insert a Tier 2 snapshot, storing each section as JSON text.
 *  Uses INSERT OR IGNORE to silently skip duplicates (same host_id + ts).
 *  Returns true if a row was actually inserted. */
export async function insertTier2Snapshot(
	db: D1Database,
	hostId: string,
	payload: Tier2Payload,
): Promise<boolean> {
	const result = await db
		.prepare(
			`INSERT OR IGNORE INTO tier2_snapshots
  (host_id, ts, ports_json, updates_json, systemd_json, security_json, docker_json, disk_deep_json, software_json)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			hostId,
			payload.timestamp,
			payload.ports ? JSON.stringify(payload.ports) : null,
			payload.updates ? JSON.stringify(payload.updates) : null,
			payload.systemd ? JSON.stringify(payload.systemd) : null,
			payload.security ? JSON.stringify(payload.security) : null,
			payload.docker ? JSON.stringify(payload.docker) : null,
			payload.disk_deep ? JSON.stringify(payload.disk_deep) : null,
			payload.software ? JSON.stringify(payload.software) : null,
		)
		.run();
	return result.meta.changes > 0;
}

/** Get the latest Tier 2 snapshot for a host, parsing JSON columns back. */
export async function getLatestTier2Snapshot(
	db: D1Database,
	hostId: string,
): Promise<Tier2Snapshot | null> {
	const row = await db
		.prepare(
			`SELECT t.host_id, t.ts, t.ports_json, t.updates_json, t.systemd_json,
       t.security_json, t.docker_json, t.disk_deep_json, t.software_json,
       h.timezone, h.dns_resolvers AS dns_resolvers_json, h.dns_search AS dns_search_json
FROM tier2_snapshots t
JOIN hosts h ON h.host_id = t.host_id
WHERE t.host_id = ?
ORDER BY t.ts DESC
LIMIT 1`,
		)
		.bind(hostId)
		.first<Tier2Row>();

	if (!row) return null;

	return {
		host_id: row.host_id,
		ts: row.ts,
		ports: safeParse(row.ports_json),
		updates: safeParse(row.updates_json),
		systemd: safeParse(row.systemd_json),
		security: safeParse(row.security_json),
		docker: safeParse(row.docker_json),
		disk_deep: safeParse(row.disk_deep_json),
		software: safeParse(row.software_json),
		timezone: row.timezone ?? null,
		dns_resolvers: safeParse(row.dns_resolvers_json),
		dns_search: safeParse(row.dns_search_json),
	};
}

interface Tier2Row {
	host_id: string;
	ts: number;
	ports_json: string | null;
	updates_json: string | null;
	systemd_json: string | null;
	security_json: string | null;
	docker_json: string | null;
	disk_deep_json: string | null;
	software_json: string | null;
	timezone: string | null;
	dns_resolvers_json: string | null;
	dns_search_json: string | null;
}

function safeParse<T>(json: string | null): T | null {
	if (!json) return null;
	try {
		return JSON.parse(json) as T;
	} catch {
		return null;
	}
}
