// Heartbeat service — process agent heartbeat reports.
// Uses source_key as the installation boundary: only agents sharing the same
// source_key are eligible for mark-missing within a single heartbeat cycle.

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
 *    - If exists: update runtime_app, runtime_version, status, last_seen_at → "updated"
 *    - If not exists: create new agent → "created"
 * 3. For agents in DB with this source_key that were NOT reported: mark status='missing' → "missing"
 *
 * All writes execute in a single db.batch() for atomicity.
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
			// Update existing agent
			statements.push(
				db
					.prepare(
						"UPDATE agents SET runtime_app = ?, runtime_version = ?, status = ?, last_seen_at = ? WHERE id = ?",
					)
					.bind(
						entry.runtime_app ?? null,
						entry.runtime_version ?? null,
						entry.status,
						now,
						existing.id,
					),
			);
			updated++;
		} else {
			// Create new agent (generate ID inline)
			const { generateId } = await import("@bat/shared");
			const id = generateId("agt_");
			statements.push(
				db
					.prepare(
						"INSERT INTO agents (id, source_key, match_key, runtime_app, runtime_version, status, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
					)
					.bind(
						id,
						sourceKey,
						entry.match_key,
						entry.runtime_app ?? null,
						entry.runtime_version ?? null,
						entry.status,
						now,
					),
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
