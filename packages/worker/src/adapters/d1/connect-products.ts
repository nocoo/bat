import {
	type AgentHeartbeatEntry,
	type AgentRow,
	type AssetRow,
	type AssetsOverview,
	type EventRow,
	generateId,
	type HostTag,
} from "@bat/shared";
import { ConnectFault } from "../../domain/connect.js";
import { generateWebhookToken } from "../../domain/webhook-token.js";
import type { ConnectProductsRepository } from "../../repos/connect-products.js";
import type { Repositories } from "../../repos/types.js";

/** A request-local repository view preserves existing product validation/DTOs.
 * All routes are explicitly registered; this is not a user-selectable dispatcher.
 * Control writes (including legacy browser/CLI writes) share the coordinator.
 */
function view<T extends object>(base: T, methods: Partial<T>): T {
	return Object.assign(Object.create(base), methods);
}

const unsupported = (): never => {
	throw new ConnectFault(
		501,
		"not_supported",
		"This operation requires workspace administration in the browser.",
	);
};

export class D1ConnectProductsRepository implements ConnectProductsRepository {
	constructor(private readonly db: D1Database) {}

	forServer(base: Repositories, serverId: string): Repositories {
		const bound = (id: string): string => {
			if (id !== serverId)
				throw new ConnectFault(
					403,
					"server_mismatch",
					"The resource is outside this token's server.",
				);
			return id;
		};
		const own = <T extends { host_id: string | null }>(rows: T[]): T[] =>
			rows.filter((row) => row.host_id === serverId);
		const ids = (values: string[]): string[] => values.filter((id) => id === serverId);
		const optionalHost = (id: string | null | undefined): void => {
			if (id !== undefined) bound(id ?? "");
		};
		const agent = async (id: string) => {
			const row = await base.agents.getById(id);
			return row?.host_id === serverId ? row : null;
		};
		const asset = async (id: string) => {
			const row = await base.assets.getById(id);
			return row?.host_id === serverId ? row : null;
		};
		const requireEntity = async (table: "agents" | "assets", id: string): Promise<void> => {
			if (
				!(await this.db
					.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND host_id = ?`)
					.bind(id, serverId)
					.first())
			)
				throw new ConnectFault(404, "not_found", "Resource not found on this server.");
		};
		const visibleTags = async (tagIds: number[]): Promise<void> => {
			if (!tagIds.length) return;
			const result = await this.db
				.prepare(
					`SELECT id FROM tags WHERE id IN (${tagIds.map(() => "?").join(",")}) AND (owner_host_id IS NULL OR owner_host_id = ?)`,
				)
				.bind(...tagIds, serverId)
				.all<{ id: number }>();
			if (result.results.length !== tagIds.length)
				throw new ConnectFault(404, "tag_not_found", "A tag is unavailable on this server.");
		};
		const writableTag = async (id: number): Promise<void> => {
			const row = await this.db
				.prepare(`SELECT 1 FROM tags t WHERE t.id = ? AND t.owner_host_id = ?
 AND NOT EXISTS (SELECT 1 FROM host_tags WHERE tag_id = t.id AND host_id != ?)
 AND NOT EXISTS (SELECT 1 FROM agent_tags j JOIN agents a ON j.agent_id = a.id WHERE j.tag_id = t.id AND (a.host_id IS NULL OR a.host_id != ?))
 AND NOT EXISTS (SELECT 1 FROM asset_tags j JOIN assets a ON j.asset_id = a.id WHERE j.tag_id = t.id AND (a.host_id IS NULL OR a.host_id != ?))`)
				.bind(id, serverId, serverId, serverId, serverId)
				.first();
			if (!row)
				throw new ConnectFault(
					403,
					"shared_resource",
					"Only tags owned exclusively by this server can be changed. Shared tags require browser administration.",
				);
		};
		const replaceEntityTags = async (table: "agents" | "assets", id: string, tagIds: number[]) => {
			await requireEntity(table, id);
			await visibleTags(tagIds);
			const join = table === "agents" ? "agent_tags" : "asset_tags";
			const column = table === "agents" ? "agent_id" : "asset_id";
			await this.db.batch([
				this.db
					.prepare(
						`DELETE FROM ${join} WHERE ${column} = ? AND EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND host_id = ?)`,
					)
					.bind(id, id, serverId),
				...tagIds.map((tagId) =>
					this.db
						.prepare(
							`INSERT INTO ${join} (${column}, tag_id) SELECT ?,? WHERE EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND host_id = ?)`,
						)
						.bind(id, tagId, id, serverId),
				),
			]);
			return { ok: true as const };
		};
		const update = async <T>(
			table: "agents" | "assets",
			id: string,
			fields: Record<string, unknown>,
			allowed: string[],
		): Promise<T | null> => {
			await requireEntity(table, id);
			optionalHost(fields.host_id as string | null | undefined);
			const entries = Object.entries(fields).filter(
				([key, value]) => allowed.includes(key) && value !== undefined,
			);
			if (!entries.length)
				return this.db
					.prepare(`SELECT * FROM ${table} WHERE id = ? AND host_id = ?`)
					.bind(id, serverId)
					.first<T>();
			return this.db
				.prepare(
					`UPDATE ${table} SET ${entries.map(([key]) => `${key} = ?`).join(",")}${table === "assets" ? ", updated_at = unixepoch()" : ""} WHERE id = ? AND host_id = ? RETURNING *`,
				)
				.bind(...entries.map(([, value]) => value), id, serverId)
				.first<T>();
		};
		const deleteEntity = async (table: "agents" | "assets", id: string): Promise<boolean> => {
			await requireEntity(table, id);
			const column = table === "agents" ? "agent_id" : "asset_id";
			const otherColumn = table === "agents" ? "asset_id" : "agent_id";
			const otherTable = table === "agents" ? "assets" : "agents";
			if (
				await this.db
					.prepare(
						`SELECT 1 FROM agent_asset_bindings b JOIN ${otherTable} o ON o.id = b.${otherColumn} WHERE b.${column} = ? AND (o.host_id IS NULL OR o.host_id != ?)`,
					)
					.bind(id, serverId)
					.first()
			)
				throw new ConnectFault(
					403,
					"shared_resource",
					"Remove cross-server bindings in the browser before deleting this resource.",
				);
			const result = await this.db
				.prepare(`DELETE FROM ${table} WHERE id = ? AND host_id = ?`)
				.bind(id, serverId)
				.run();
			return result.meta.changes > 0;
		};
		const scoped: Repositories = {
			...base,
			hosts: view(base.hosts, {
				listActiveHostIds: async () => own(await base.hosts.listActiveHostIds()),
				listAllHostIdsWithActive: async () => own(await base.hosts.listAllHostIdsWithActive()),
				listOverviewRows: async () => own(await base.hosts.listOverviewRows()),
				listStatusRows: async () => own(await base.hosts.listStatusRows()),
				getActiveFlag: (id) => base.hosts.getActiveFlag(bound(id)),
				getActiveAndMaintenance: (id) => base.hosts.getActiveAndMaintenance(bound(id)),
				getDetailRow: (id) => base.hosts.getDetailRow(bound(id)),
				getStatusRow: (id) => base.hosts.getStatusRow(bound(id)),
				getLatestUptime: (id) => base.hosts.getLatestUptime(bound(id)),
				getLatestMetricsBatch: (hostIds) => base.hosts.getLatestMetricsBatch(ids(hostIds)),
				listSparklineRowsSince: (hostIds, since) =>
					base.hosts.listSparklineRowsSince(ids(hostIds), since),
				upsertIdentity: (params) => {
					bound(params.hostId);
					return base.hosts.upsertIdentity(params);
				},
				updateInventory: (id, fields) => base.hosts.updateInventory(bound(id), fields),
				updateTier2Inventory: (id, fields) => base.hosts.updateTier2Inventory(bound(id), fields),
				updateDescription: (id, value) => base.hosts.updateDescription(bound(id), value),
				ensureExists: (id, name, now) => base.hosts.ensureExists(bound(id), name, now),
				touchLastSeen: (id, now) => base.hosts.touchLastSeen(bound(id), now),
			}),
			metrics: {
				queryRaw: (id, from, to) => base.metrics.queryRaw(bound(id), from, to),
				queryHourly: (id, from, to) => base.metrics.queryHourly(bound(id), from, to),
				insertRawWithHostUpsert: (id, name, payload, now, mode) =>
					base.metrics.insertRawWithHostUpsert(bound(id), name, payload, now, mode),
			},
			tier2: {
				getLatestForHost: (id) => base.tier2.getLatestForHost(bound(id)),
				insertSnapshot: (id, payload) => base.tier2.insertSnapshot(bound(id), payload),
			},
			alerts: view(base.alerts, {
				listActiveJoinedHosts: async () => own(await base.alerts.listActiveJoinedHosts()),
				listForHosts: (hostIds) => base.alerts.listForHosts(ids(hostIds)),
				countByHost: (hostIds) => base.alerts.countByHost(ids(hostIds)),
				evaluateAndApply: (id, payload, now, opts) =>
					base.alerts.evaluateAndApply(bound(id), payload, now, opts),
				evaluateAndApplyTier2: (id, payload, now) =>
					base.alerts.evaluateAndApplyTier2(bound(id), payload, now),
				clearPendingForHost: (id, opts) => base.alerts.clearPendingForHost(bound(id), opts),
			}),
			events: view(base.events, {
				count: (id) => base.events.count(id ? bound(id) : serverId),
				list: (id, limit, offset) => base.events.list(id ? bound(id) : serverId, limit, offset),
				findActiveWebhookByToken: unsupported,
				insertEvent: unsupported,
			}),
			maintenance: {
				getForHost: (id) => base.maintenance.getForHost(bound(id)),
				setForHost: (id, value, opts) => base.maintenance.setForHost(bound(id), value, opts),
				clearForHost: (id, opts) => base.maintenance.clearForHost(bound(id), opts),
			},
			ports: view(base.ports, {
				listAllByHost: async () => {
					const all = await base.ports.listAllByHost();
					return { [serverId]: all[serverId] ?? [] };
				},
				listForHost: (id) => base.ports.listForHost(bound(id)),
				listForHosts: (hostIds) => base.ports.listForHosts(ids(hostIds)),
				addToHost: (id, port, reason) => base.ports.addToHost(bound(id), port, reason),
				removeFromHost: (id, port) => base.ports.removeFromHost(bound(id), port),
			}),
			tags: view(base.tags, {
				list: async () =>
					(
						await this.db
							.prepare(
								`SELECT t.id, t.name, t.color, (SELECT COUNT(*) FROM host_tags h WHERE h.tag_id = t.id AND h.host_id = ?) AS host_count FROM tags t WHERE t.owner_host_id IS NULL OR t.owner_host_id = ? ORDER BY t.name, t.id`,
							)
							.bind(serverId, serverId)
							.all<{ id: number; name: string; color: number; host_count: number }>()
					).results,
				create: async (name, color) => {
					try {
						const row = await this.db
							.prepare(
								"INSERT INTO tags(name, color, owner_host_id) VALUES (?,?,?) RETURNING id, name, color",
							)
							.bind(name, color ?? 0, serverId)
							.first<HostTag>();
						if (!row) throw new ConnectFault(500, "internal_error", "Tag could not be created.");
						return { ok: true, row };
					} catch (error) {
						if (error instanceof Error && error.message.includes("UNIQUE"))
							return { ok: "duplicate" };
						throw error;
					}
				},
				update: async (id, fields) => {
					await writableTag(id);
					return base.tags.update(id, fields);
				},
				delete: async (id) => {
					await writableTag(id);
					return base.tags.delete(id);
				},
				byHostsAll: async () => ({ [serverId]: await base.tags.listForHost(serverId) }),
				listForHost: (id) => base.tags.listForHost(bound(id)),
				addToHost: async (id, tagId) => {
					bound(id);
					await visibleTags([tagId]);
					return base.tags.addToHost(id, tagId);
				},
				replaceForHost: async (id, tagIds) => {
					bound(id);
					await visibleTags(tagIds);
					await this.db.batch([
						this.db.prepare("DELETE FROM host_tags WHERE host_id = ?").bind(id),
						...tagIds.map((tagId) =>
							this.db
								.prepare("INSERT INTO host_tags(host_id, tag_id) VALUES (?,?)")
								.bind(id, tagId),
						),
					]);
					return { ok: true, tags: await base.tags.listForHost(id) };
				},
				removeFromHost: (id, tagId) => base.tags.removeFromHost(bound(id), tagId),
				listNamesForHosts: (hostIds) => base.tags.listNamesForHosts(ids(hostIds)),
			}),
			agents: {
				list: async () => own(await base.agents.list()),
				getById: agent,
				hostExists: async (id) => id === serverId,
				delete: (id) => deleteEntity("agents", id),
				update: (id, fields) =>
					update<AgentRow>("agents", id, fields, [
						"nickname",
						"role",
						"runtime_app",
						"runtime_version",
						"status",
						"metadata",
					]),
				replaceTags: (id, tagIds) => replaceEntityTags("agents", id, tagIds),
				upsertBy: async (params, fields) => {
					if (params.host_id !== null) optionalHost(params.host_id);
					optionalHost(fields.host_id);
					const existing = await this.db
						.prepare("SELECT id, host_id FROM agents WHERE source_key = ? AND match_key = ?")
						.bind(params.source_key, params.match_key)
						.first<{ id: string; host_id: string | null }>();
					if (existing && existing.host_id !== serverId)
						throw new ConnectFault(
							409,
							"source_conflict",
							"This installation identity is unavailable on this server.",
						);
					return base.agents.upsertBy(
						{ ...params, host_id: serverId },
						{ ...fields, host_id: serverId },
					);
				},
				processHeartbeat: (source, entries, now) => this.heartbeat(serverId, source, entries, now),
			},
			assets: {
				list: async () => own(await base.assets.list()),
				getById: asset,
				hostExists: async (id) => id === serverId,
				create: (params) => {
					if (params.host_id !== null) optionalHost(params.host_id);
					return base.assets.create({ ...params, host_id: serverId });
				},
				update: (id, fields) =>
					update<AssetRow>("assets", id, fields, [
						"name",
						"subtype",
						"provider",
						"status",
						"metadata",
					]),
				delete: (id) => deleteEntity("assets", id),
				replaceTags: (id, tagIds) => replaceEntityTags("assets", id, tagIds),
			},
			webhooks: {
				// Read tokens must never receive a credential that can write events.
				list: async () =>
					own(await base.webhooks.list()).map((row) => ({ ...row, token: "[redacted]" })),
				create: (id, now) => base.webhooks.create(bound(id), now),
				delete: async (id) =>
					(
						await this.db
							.prepare("DELETE FROM webhook_configs WHERE id = ? AND host_id = ?")
							.bind(id, serverId)
							.run()
					).meta.changes > 0,
				regenerateToken: async (id, now) =>
					(
						await this.db
							.prepare(
								"UPDATE webhook_configs SET token = ?, updated_at = ? WHERE id = ? AND host_id = ? RETURNING token",
							)
							.bind(generateWebhookToken(), now, id, serverId)
							.first<{ token: string }>()
					)?.token ?? null,
			},
			settings: {
				getRetentionDays: () => base.settings.getRetentionDays(),
				setRetentionDays: unsupported,
			},
			bindings: {
				list: async () => {
					const [agents, assets, rows] = await Promise.all([
						scoped.agents.list(),
						scoped.assets.list(),
						base.bindings.list(),
					]);
					const a = new Set(agents.map((row) => row.id)),
						b = new Set(assets.map((row) => row.id));
					return rows.filter((row) => a.has(row.agent_id) && b.has(row.asset_id));
				},
				agentExists: async (id) => !!(await agent(id)),
				assetExists: async (id) => !!(await asset(id)),
				create: async (agentId, assetId) => {
					await requireEntity("agents", agentId);
					await requireEntity("assets", assetId);
					return base.bindings.create(agentId, assetId);
				},
				delete: async (agentId, assetId) => {
					await requireEntity("agents", agentId);
					await requireEntity("assets", assetId);
					return base.bindings.delete(agentId, assetId);
				},
				getAssetMap: async () => {
					const map = await base.bindings.getAssetMap();
					const agents = own(map.agents),
						assets = own(map.assets);
					const a = new Set(agents.map((row) => row.id)),
						b = new Set(assets.map((row) => row.id));
					return {
						hosts: own(map.hosts),
						agents,
						assets,
						bindings: map.bindings.filter((row) => a.has(row.agent_id) && b.has(row.asset_id)),
						tags: map.tags.filter((row) =>
							row.entity_type === "host"
								? row.entity_id === serverId
								: row.entity_type === "agent"
									? a.has(row.entity_id)
									: b.has(row.entity_id),
						),
					};
				},
				getOverview: async () => {
					const [agents, assets, bindings] = await Promise.all([
						scoped.agents.list(),
						scoped.assets.list(),
						scoped.bindings.list(),
					]);
					const result: AssetsOverview = {
						agents: {
							total: agents.length,
							by_status: { running: 0, stopped: 0, missing: 0, unknown: 0 },
						},
						assets: {
							total: assets.length,
							by_type: { cloud_service: 0, domain: 0, container: 0, cli_tool: 0, mcp_service: 0 },
							by_status: { active: 0, inactive: 0, missing: 0, unknown: 0 },
						},
						bindings: bindings.length,
					};
					for (const row of agents) result.agents.by_status[row.status]++;
					for (const row of assets) {
						result.assets.by_type[row.type]++;
						result.assets.by_status[row.status]++;
					}
					return result;
				},
			},
		};
		return scoped;
	}

	private async heartbeat(
		serverId: string,
		source: string,
		entries: AgentHeartbeatEntry[],
		now: number,
	) {
		const existing = (
			await this.db
				.prepare("SELECT id, host_id, match_key, status FROM agents WHERE source_key = ?")
				.bind(source)
				.all<{ id: string; host_id: string | null; match_key: string; status: string }>()
		).results;
		if (existing.some((row) => row.host_id !== serverId))
			throw new ConnectFault(
				409,
				"source_conflict",
				"This installation identity is unavailable on this server.",
			);
		const keys = new Set(entries.map((entry) => entry.match_key));
		const missing = existing.filter((row) => !keys.has(row.match_key) && row.status !== "missing");
		const statements = entries.map((entry) =>
			this.db
				.prepare(
					`INSERT INTO agents(id, host_id, source_key, match_key, status, runtime_app, runtime_version, last_seen_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(source_key, match_key) DO UPDATE SET status = excluded.status, last_seen_at = excluded.last_seen_at${"runtime_app" in entry ? ", runtime_app = excluded.runtime_app" : ""}${"runtime_version" in entry ? ", runtime_version = excluded.runtime_version" : ""} WHERE agents.host_id = excluded.host_id`,
				)
				.bind(
					generateId("agt_"),
					serverId,
					source,
					entry.match_key,
					entry.status,
					entry.runtime_app ?? null,
					entry.runtime_version ?? null,
					now,
				),
		);
		statements.push(
			...missing.map((row) =>
				this.db
					.prepare("UPDATE agents SET status = 'missing' WHERE id = ? AND host_id = ?")
					.bind(row.id, serverId),
			),
		);
		if (statements.length) await this.db.batch(statements);
		const prior = new Set(existing.map((row) => row.match_key));
		const created = entries.filter((entry) => !prior.has(entry.match_key)).length;
		return { created, updated: entries.length - created, missing: missing.length };
	}

	async appendEvent(
		serverId: string,
		title: string,
		body: string,
		tags: string[],
		now: number,
	): Promise<void> {
		await this.db
			.prepare(
				"INSERT INTO events(host_id, webhook_config_id, title, body, tags, source_ip, created_at) VALUES (?,NULL,?,?,?,'connect',?)",
			)
			.bind(serverId, title, body, JSON.stringify(tags), now)
			.run();
	}

	async eventsPage(serverId: string, afterId: number, limit: number): Promise<EventRow[]> {
		return (
			await this.db
				.prepare(
					"SELECT e.id, e.host_id, h.hostname, e.title, e.body, e.tags, e.source_ip, e.created_at FROM events e JOIN hosts h ON h.host_id = e.host_id WHERE e.host_id = ? AND e.id > ? ORDER BY e.id LIMIT ?",
				)
				.bind(serverId, afterId, limit)
				.all<EventRow>()
		).results;
	}
}
