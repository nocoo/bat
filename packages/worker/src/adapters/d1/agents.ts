// D1-backed AgentsRepository. SQL lifted verbatim from
// `services/agents.ts` and `services/heartbeat.ts` (both now removed).

import { generateId } from "@bat/shared";
import type { AgentHeartbeatEntry, AgentHeartbeatResponse, AgentItem, AgentRow } from "@bat/shared";
import type { AgentsRepository } from "../../repos/types.js";

interface TagRef {
	id: number;
	name: string;
	color: number;
}

export class D1AgentsRepository implements AgentsRepository {
	private readonly db: D1Database;

	constructor(db: D1Database) {
		this.db = db;
	}

	async list(): Promise<AgentItem[]> {
		const rows = await this.db
			.prepare(
				`SELECT a.*, h.hostname
			 FROM agents a
			 LEFT JOIN hosts h ON a.host_id = h.host_id
			 ORDER BY a.created_at DESC`,
			)
			.all<AgentRow & { hostname: string | null }>();
		const tags = await this.loadAgentTags(rows.results.map((r) => r.id));
		return rows.results.map((row) => toAgentItem(row, tags.get(row.id) ?? []));
	}

	async getById(id: string): Promise<AgentItem | null> {
		const row = await this.db
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
		const tags = await this.loadAgentTags([id]);
		return toAgentItem(row, tags.get(id) ?? []);
	}

	async delete(id: string): Promise<boolean> {
		const result = await this.db.prepare("DELETE FROM agents WHERE id = ?").bind(id).run();
		return (result.meta?.changes ?? 0) > 0;
	}

	async update(
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
			return this.db.prepare("SELECT * FROM agents WHERE id = ?").bind(id).first<AgentRow>();
		}

		bindings.push(id);
		return this.db
			.prepare(`UPDATE agents SET ${setClauses.join(", ")} WHERE id = ? RETURNING *`)
			.bind(...bindings)
			.first<AgentRow>();
	}

	async upsertBy(
		createParams: {
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
		updateFields: {
			host_id?: string | null | undefined;
			nickname?: string | null | undefined;
			role?: string | null | undefined;
			runtime_app?: string | null | undefined;
			runtime_version?: string | null | undefined;
			status?: string | undefined;
			metadata?: string | undefined;
		},
	): Promise<{ id: string; created: boolean }> {
		const candidateId = generateId("agt_");
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

		const row = await this.db
			.prepare(sql)
			.bind(...insertBindings, ...updateBindings)
			.first<{ id: string }>();
		if (!row) {
			throw new Error("upsertBy: INSERT ... ON CONFLICT returned no row");
		}
		return { id: row.id, created: row.id === candidateId };
	}

	async replaceTags(
		agentId: string,
		tagIds: number[],
	): Promise<{ ok: true } | { ok: "tags_not_found"; missing: number[] }> {
		if (tagIds.length === 0) {
			await this.db.prepare("DELETE FROM agent_tags WHERE agent_id = ?").bind(agentId).run();
			return { ok: true };
		}

		const placeholders = tagIds.map(() => "?").join(",");
		const existing = await this.db
			.prepare(`SELECT id FROM tags WHERE id IN (${placeholders})`)
			.bind(...tagIds)
			.all<{ id: number }>();
		const existingIds = new Set(existing.results.map((r) => r.id));
		const missing = tagIds.filter((id) => !existingIds.has(id));
		if (missing.length > 0) {
			return { ok: "tags_not_found", missing };
		}

		const stmts: D1PreparedStatement[] = [
			this.db.prepare("DELETE FROM agent_tags WHERE agent_id = ?").bind(agentId),
			...tagIds.map((tagId) =>
				this.db
					.prepare("INSERT INTO agent_tags (agent_id, tag_id) VALUES (?, ?)")
					.bind(agentId, tagId),
			),
		];
		await this.db.batch(stmts);
		return { ok: true };
	}

	async hostExists(hostId: string): Promise<boolean> {
		const row = await this.db
			.prepare("SELECT 1 FROM hosts WHERE host_id = ?")
			.bind(hostId)
			.first<{ 1: number }>();
		return row !== null;
	}

	async processHeartbeat(
		sourceKey: string,
		agents: AgentHeartbeatEntry[],
		nowSeconds: number,
	): Promise<AgentHeartbeatResponse> {
		const existingRows = await this.db
			.prepare("SELECT id, match_key, status FROM agents WHERE source_key = ?")
			.bind(sourceKey)
			.all<{ id: string; match_key: string; status: string }>();

		const existingByMatchKey = new Map<string, { id: string; status: string }>();
		for (const row of existingRows.results) {
			existingByMatchKey.set(row.match_key, { id: row.id, status: row.status });
		}

		const statements: D1PreparedStatement[] = [];
		let updated = 0;
		let created = 0;
		let missing = 0;
		const reportedMatchKeys = new Set<string>();

		for (const entry of agents) {
			reportedMatchKeys.add(entry.match_key);
			const existing = existingByMatchKey.get(entry.match_key);
			if (existing) {
				const setClauses: string[] = ["status = ?", "last_seen_at = ?"];
				const bindings: unknown[] = [entry.status, nowSeconds];
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
					this.db
						.prepare(`UPDATE agents SET ${setClauses.join(", ")} WHERE id = ?`)
						.bind(...bindings),
				);
				updated++;
			} else {
				const id = generateId("agt_");
				const runtimeApp = "runtime_app" in entry ? (entry.runtime_app ?? null) : null;
				const runtimeVersion = "runtime_version" in entry ? (entry.runtime_version ?? null) : null;
				const conflictSets = ["status = excluded.status", "last_seen_at = excluded.last_seen_at"];
				if ("runtime_app" in entry) {
					conflictSets.push("runtime_app = excluded.runtime_app");
				}
				if ("runtime_version" in entry) {
					conflictSets.push("runtime_version = excluded.runtime_version");
				}
				statements.push(
					this.db
						.prepare(
							`INSERT INTO agents (id, source_key, match_key, runtime_app, runtime_version, status, last_seen_at)
						 VALUES (?, ?, ?, ?, ?, ?, ?)
						 ON CONFLICT(source_key, match_key) DO UPDATE SET
						   ${conflictSets.join(", ")}`,
						)
						.bind(
							id,
							sourceKey,
							entry.match_key,
							runtimeApp,
							runtimeVersion,
							entry.status,
							nowSeconds,
						),
				);
				created++;
			}
		}

		for (const row of existingRows.results) {
			if (!reportedMatchKeys.has(row.match_key) && row.status !== "missing") {
				statements.push(
					this.db.prepare("UPDATE agents SET status = 'missing' WHERE id = ?").bind(row.id),
				);
				missing++;
			}
		}

		if (statements.length > 0) {
			await this.db.batch(statements);
		}

		return { updated, created, missing };
	}

	private async loadAgentTags(agentIds: string[]): Promise<Map<string, TagRef[]>> {
		const result = new Map<string, TagRef[]>();
		if (agentIds.length === 0) {
			return result;
		}
		const placeholders = agentIds.map(() => "?").join(",");
		const rows = await this.db
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
