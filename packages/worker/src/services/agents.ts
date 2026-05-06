// Agent CRUD service — D1 operations for the agents table.

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

/** Find an agent by source_key + match_key (for upsert semantics). */
export async function findAgentBySourceMatch(
	db: D1Database,
	sourceKey: string,
	matchKey: string,
): Promise<AgentRow | null> {
	return db
		.prepare("SELECT * FROM agents WHERE source_key = ? AND match_key = ?")
		.bind(sourceKey, matchKey)
		.first<AgentRow>();
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
