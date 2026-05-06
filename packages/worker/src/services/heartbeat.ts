// Heartbeat service — process agent heartbeat reports.
// Uses source_key as the installation boundary: only agents sharing the same
// source_key are eligible for mark-missing within a single heartbeat cycle.

import { generateId } from "@bat/shared";
import type { AgentHeartbeatEntry, AgentHeartbeatResponse } from "@bat/shared";

export interface HeartbeatResult extends AgentHeartbeatResponse {
	// extends the response type with nothing extra for now
}

/**
 * Process a heartbeat from a CLI installation (identified by source_key).
 *
 * Logic:
 * 1. Find all existing agents with the given source_key.
 * 2. For each reported agent (by match_key):
 *    - If exists: update only provided fields (status always, runtime_* only if present)
 *    - If not exists: upsert via INSERT ... ON CONFLICT DO UPDATE (race-safe)
 * 3. For agents in DB with this source_key that were NOT reported: mark status='missing'
 *
 * Field semantics for runtime_app / runtime_version:
 *   - undefined: field absent from payload → preserve existing DB value
 *   - null: explicitly sent as null → clear the field
 *   - string: update to new value
 *
 * All writes execute in a single db.batch() for atomicity.
 * The INSERT uses ON CONFLICT(source_key, match_key) DO UPDATE to be
 * idempotent under concurrent/retry scenarios.
 */
export async function processHeartbeat(
	db: D1Database,
	sourceKey: string,
	agents: AgentHeartbeatEntry[],
	now: number,
): Promise<HeartbeatResult> {
	// Phase 1: Read current state for this source_key
	const existingRows = await db
		.prepare("SELECT id, match_key, status FROM agents WHERE source_key = ?")
		.bind(sourceKey)
		.all<{ id: string; match_key: string; status: string }>();

	const existingByMatchKey = new Map<string, { id: string; status: string }>();
	for (const row of existingRows.results) {
		existingByMatchKey.set(row.match_key, { id: row.id, status: row.status });
	}

	// Phase 2: Build batch statements
	const statements: D1PreparedStatement[] = [];
	let updated = 0;
	let created = 0;
	let missing = 0;

	const reportedMatchKeys = new Set<string>();

	for (const entry of agents) {
		reportedMatchKeys.add(entry.match_key);

		const existing = existingByMatchKey.get(entry.match_key);
		if (existing) {
			// Update existing agent — only SET fields that are provided
			const setClauses: string[] = ["status = ?", "last_seen_at = ?"];
			const bindings: unknown[] = [entry.status, now];

			if ("runtime_app" in entry) {
				setClauses.push("runtime_app = ?");
				bindings.push(entry.runtime_app ?? null);
			}
			if ("runtime_version" in entry) {
				setClauses.push("runtime_version = ?");
				bindings.push(entry.runtime_version ?? null);
			}

			bindings.push(existing.id);
			statements.push(
				db.prepare(`UPDATE agents SET ${setClauses.join(", ")} WHERE id = ?`).bind(...bindings),
			);
			updated++;
		} else {
			// Create new agent — use ON CONFLICT for idempotency under concurrent/retry
			const id = generateId("agt_");
			const runtimeApp = "runtime_app" in entry ? (entry.runtime_app ?? null) : null;
			const runtimeVersion = "runtime_version" in entry ? (entry.runtime_version ?? null) : null;
			statements.push(
				db
					.prepare(
						`INSERT INTO agents (id, source_key, match_key, runtime_app, runtime_version, status, last_seen_at)
						 VALUES (?, ?, ?, ?, ?, ?, ?)
						 ON CONFLICT(source_key, match_key) DO UPDATE SET
						   runtime_app = COALESCE(excluded.runtime_app, agents.runtime_app),
						   runtime_version = COALESCE(excluded.runtime_version, agents.runtime_version),
						   status = excluded.status,
						   last_seen_at = excluded.last_seen_at`,
					)
					.bind(id, sourceKey, entry.match_key, runtimeApp, runtimeVersion, entry.status, now),
			);
			created++;
		}
	}

	// Phase 3: Mark missing — agents in DB that were not reported
	for (const row of existingRows.results) {
		if (!reportedMatchKeys.has(row.match_key) && row.status !== "missing") {
			statements.push(db.prepare("UPDATE agents SET status = 'missing' WHERE id = ?").bind(row.id));
			missing++;
		}
	}

	// Execute atomically
	if (statements.length > 0) {
		await db.batch(statements);
	}

	return { updated, created, missing };
}
