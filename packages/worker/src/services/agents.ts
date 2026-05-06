// Agent CRUD service — D1 operations for the agents table.

import { generateId } from "@bat/shared";
import type { AgentItem, AgentRow } from "@bat/shared";

/** List all agents with hostname join and tags. */
export async function listAgents(db: D1Database): Promise<AgentItem[]> {
	const rows = await db
		.prepare(
			`SELECT a.*, h.hostname
			 FROM agents a
			 LEFT JOIN hosts h ON a.host_id = h.host_id
			 ORDER BY a.created_at DESC`,
		)
		.all<AgentRow & { hostname: string | null }>();

	// Batch-load tags for all agents
	const agentIds = rows.results.map((r) => r.id);
	const tags = await loadAgentTags(db, agentIds);

	return rows.results.map((row) => toAgentItem(row, tags.get(row.id) ?? []));
}

/** Get a single agent by ID with hostname and tags. */
export async function getAgent(db: D1Database, id: string): Promise<AgentItem | null> {
	const row = await db
		.prepare(
			`SELECT a.*, h.hostname
			 FROM agents a
			 LEFT JOIN hosts h ON a.host_id = h.host_id
			 WHERE a.id = ?`,
		)
		.bind(id)
		.first<AgentRow & { hostname: string | null }>();

	if (!row) {
		return null;
	}

	const tags = await loadAgentTags(db, [id]);
	return toAgentItem(row, tags.get(id) ?? []);
}

/** Create a new agent. Returns the created row. */
export async function createAgent(
	db: D1Database,
	params: {
		id: string;
		source_key: string;
		match_key: string;
		host_id?: string | null;
		nickname?: string | null;
		role?: string | null;
		runtime_app?: string | null;
		runtime_version?: string | null;
		status?: string;
		metadata?: string;
	},
): Promise<AgentRow> {
	const row = await db
		.prepare(
			`INSERT INTO agents (id, source_key, match_key, host_id, nickname, role, runtime_app, runtime_version, status, metadata)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			 RETURNING *`,
		)
		.bind(
			params.id,
			params.source_key,
			params.match_key,
			params.host_id ?? null,
			params.nickname ?? null,
			params.role ?? null,
			params.runtime_app ?? null,
			params.runtime_version ?? null,
			params.status ?? "unknown",
			params.metadata ?? "{}",
		)
		.first<AgentRow>();

	if (!row) {
		throw new Error("Failed to create agent");
	}
	return row;
}

/** Update an existing agent. Returns the updated row or null if not found. */
export async function updateAgent(
	db: D1Database,
	id: string,
	fields: {
		host_id?: string | null | undefined;
		nickname?: string | null | undefined;
		role?: string | null | undefined;
		runtime_app?: string | null | undefined;
		runtime_version?: string | null | undefined;
		status?: string | undefined;
		metadata?: string | undefined;
	},
): Promise<AgentRow | null> {
	const setClauses: string[] = [];
	const bindings: unknown[] = [];

	if (fields.host_id !== undefined) {
		setClauses.push("host_id = ?");
		bindings.push(fields.host_id);
	}
	if (fields.nickname !== undefined) {
		setClauses.push("nickname = ?");
		bindings.push(fields.nickname);
	}
	if (fields.role !== undefined) {
		setClauses.push("role = ?");
		bindings.push(fields.role);
	}
	if (fields.runtime_app !== undefined) {
		setClauses.push("runtime_app = ?");
		bindings.push(fields.runtime_app);
	}
	if (fields.runtime_version !== undefined) {
		setClauses.push("runtime_version = ?");
		bindings.push(fields.runtime_version);
	}
	if (fields.status !== undefined) {
		setClauses.push("status = ?");
		bindings.push(fields.status);
	}
	if (fields.metadata !== undefined) {
		setClauses.push("metadata = ?");
		bindings.push(fields.metadata);
	}

	if (setClauses.length === 0) {
		// No fields to update — just return current row
		return db.prepare("SELECT * FROM agents WHERE id = ?").bind(id).first<AgentRow>();
	}

	bindings.push(id);
	const row = await db
		.prepare(`UPDATE agents SET ${setClauses.join(", ")} WHERE id = ? RETURNING *`)
		.bind(...bindings)
		.first<AgentRow>();

	return row;
}

/** Hard-delete an agent. Returns true if deleted. */
export async function deleteAgent(db: D1Database, id: string): Promise<boolean> {
	const result = await db.prepare("DELETE FROM agents WHERE id = ?").bind(id).run();
	return result.meta.changes > 0;
}

/** Check if a host_id exists in the hosts table. */
export async function hostExists(db: D1Database, hostId: string): Promise<boolean> {
	const row = await db
		.prepare("SELECT 1 FROM hosts WHERE host_id = ?")
		.bind(hostId)
		.first<{ 1: number }>();
	return row !== null;
}

export interface UpsertAgentParams {
	source_key: string;
	match_key: string;
	host_id?: string | null;
	nickname?: string | null;
	role?: string | null;
	runtime_app?: string | null;
	runtime_version?: string | null;
	status?: string;
	metadata?: string;
}

export interface UpsertAgentUpdateFields {
	host_id?: string | null | undefined;
	nickname?: string | null | undefined;
	role?: string | null | undefined;
	runtime_app?: string | null | undefined;
	runtime_version?: string | null | undefined;
	status?: string | undefined;
	metadata?: string | undefined;
}

export interface UpsertResult {
	id: string;
	created: boolean;
}

/**
 * Atomic upsert via INSERT ... ON CONFLICT(source_key, match_key) DO UPDATE.
 * Race-free: a single SQL statement handles both create and update.
 * Returns the agent ID and whether it was newly created.
 *
 * Detection: we generate a candidate `id`; if the returned row's `id` matches,
 * it was an INSERT (created). Otherwise ON CONFLICT fired and the existing
 * row's `id` is preserved (updated).
 */
export async function upsertAgent(
	db: D1Database,
	createParams: UpsertAgentParams,
	updateFields: UpsertAgentUpdateFields,
): Promise<UpsertResult> {
	const candidateId = generateId("agt_");

	// Build DO UPDATE SET clause from updateFields (only provided fields)
	const setClauses: string[] = [];
	const updateBindings: unknown[] = [];

	if (updateFields.host_id !== undefined) {
		setClauses.push("host_id = ?");
		updateBindings.push(updateFields.host_id);
	}
	if (updateFields.nickname !== undefined) {
		setClauses.push("nickname = ?");
		updateBindings.push(updateFields.nickname);
	}
	if (updateFields.role !== undefined) {
		setClauses.push("role = ?");
		updateBindings.push(updateFields.role);
	}
	if (updateFields.runtime_app !== undefined) {
		setClauses.push("runtime_app = ?");
		updateBindings.push(updateFields.runtime_app);
	}
	if (updateFields.runtime_version !== undefined) {
		setClauses.push("runtime_version = ?");
		updateBindings.push(updateFields.runtime_version);
	}
	if (updateFields.status !== undefined) {
		setClauses.push("status = ?");
		updateBindings.push(updateFields.status);
	}
	if (updateFields.metadata !== undefined) {
		setClauses.push("metadata = ?");
		updateBindings.push(updateFields.metadata);
	}

	// If no update fields provided, ON CONFLICT should still be a no-op update
	// to trigger RETURNING. Use a self-assignment on source_key.
	const doUpdateSql =
		setClauses.length > 0
			? `DO UPDATE SET ${setClauses.join(", ")}`
			: "DO UPDATE SET source_key = excluded.source_key";

	const sql = `INSERT INTO agents (id, source_key, match_key, host_id, nickname, role, runtime_app, runtime_version, status, metadata)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(source_key, match_key) ${doUpdateSql}
		 RETURNING id`;

	const insertBindings = [
		candidateId,
		createParams.source_key,
		createParams.match_key,
		createParams.host_id ?? null,
		createParams.nickname ?? null,
		createParams.role ?? null,
		createParams.runtime_app ?? null,
		createParams.runtime_version ?? null,
		createParams.status ?? "unknown",
		createParams.metadata ?? "{}",
	];

	const allBindings = [...insertBindings, ...updateBindings];
	const row = await db
		.prepare(sql)
		.bind(...allBindings)
		.first<{ id: string }>();

	if (!row) {
		throw new Error("upsertAgent: INSERT ... ON CONFLICT returned no row");
	}

	return { id: row.id, created: row.id === candidateId };
}

/** Replace all tags for an agent. Validates that all tag IDs exist. */
export async function replaceAgentTags(
	db: D1Database,
	agentId: string,
	tagIds: number[],
): Promise<{ ok: true } | { ok: false; error: string }> {
	if (tagIds.length === 0) {
		// Clear all tags
		await db.prepare("DELETE FROM agent_tags WHERE agent_id = ?").bind(agentId).run();
		return { ok: true };
	}

	// Verify all tag IDs exist
	const placeholders = tagIds.map(() => "?").join(",");
	const existing = await db
		.prepare(`SELECT id FROM tags WHERE id IN (${placeholders})`)
		.bind(...tagIds)
		.all<{ id: number }>();

	const existingIds = new Set(existing.results.map((r) => r.id));
	const missing = tagIds.filter((id) => !existingIds.has(id));
	if (missing.length > 0) {
		return { ok: false, error: `tag_ids not found: ${missing.join(", ")}` };
	}

	// Replace: delete existing + insert new (within batch)
	const stmts: D1PreparedStatement[] = [
		db.prepare("DELETE FROM agent_tags WHERE agent_id = ?").bind(agentId),
		...tagIds.map((tagId) =>
			db.prepare("INSERT INTO agent_tags (agent_id, tag_id) VALUES (?, ?)").bind(agentId, tagId),
		),
	];
	await db.batch(stmts);
	return { ok: true };
}

// --- Internal helpers ---

interface TagRef {
	id: number;
	name: string;
	color: number;
}

/** Batch-load tags for a list of agent IDs. */
async function loadAgentTags(db: D1Database, agentIds: string[]): Promise<Map<string, TagRef[]>> {
	const result = new Map<string, TagRef[]>();
	if (agentIds.length === 0) {
		return result;
	}

	const placeholders = agentIds.map(() => "?").join(",");
	const rows = await db
		.prepare(
			`SELECT at.agent_id, t.id, t.name, t.color
			 FROM agent_tags at
			 JOIN tags t ON at.tag_id = t.id
			 WHERE at.agent_id IN (${placeholders})`,
		)
		.bind(...agentIds)
		.all<{ agent_id: string; id: number; name: string; color: number }>();

	for (const row of rows.results) {
		const list = result.get(row.agent_id) ?? [];
		list.push({ id: row.id, name: row.name, color: row.color });
		result.set(row.agent_id, list);
	}
	return result;
}

function toAgentItem(row: AgentRow & { hostname: string | null }, tags: TagRef[]): AgentItem {
	return {
		id: row.id,
		host_id: row.host_id,
		hostname: row.hostname,
		source_key_short: row.source_key.slice(0, 8),
		match_key: row.match_key,
		nickname: row.nickname,
		role: row.role,
		runtime_app: row.runtime_app,
		runtime_version: row.runtime_version,
		status: row.status,
		metadata: JSON.parse(row.metadata),
		tags,
		created_at: row.created_at,
		last_seen_at: row.last_seen_at,
	};
}
