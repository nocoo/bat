// Binding CRUD + map/overview read models — D1 operations.

import type {
	AssetMapAgent,
	AssetMapAsset,
	AssetMapBinding,
	AssetMapResponse,
	AssetMapTagEntry,
	AssetsOverview,
	BindingItem,
	BindingRow,
} from "@bat/shared";

/** List all bindings with agent/asset info. */
export async function listBindings(db: D1Database): Promise<BindingItem[]> {
	const rows = await db
		.prepare(
			`SELECT b.agent_id, b.asset_id, b.created_at,
			        ag.nickname AS agent_nickname,
			        a.name AS asset_name, a.type AS asset_type
			 FROM agent_asset_bindings b
			 JOIN agents ag ON b.agent_id = ag.id
			 JOIN assets a ON b.asset_id = a.id
			 ORDER BY b.created_at DESC`,
		)
		.all<
			BindingRow & {
				agent_nickname: string | null;
				asset_name: string;
				asset_type: string;
			}
		>();

	return rows.results.map((r) => ({
		agent_id: r.agent_id,
		agent_nickname: r.agent_nickname,
		asset_id: r.asset_id,
		asset_name: r.asset_name,
		asset_type: r.asset_type as BindingItem["asset_type"],
		created_at: r.created_at,
	}));
}

/** Create a binding. Returns false if it already exists (idempotent). */
export async function createBinding(
	db: D1Database,
	agentId: string,
	assetId: string,
): Promise<{ created: boolean }> {
	try {
		await db
			.prepare("INSERT INTO agent_asset_bindings (agent_id, asset_id) VALUES (?, ?)")
			.bind(agentId, assetId)
			.run();
		return { created: true };
	} catch (err: unknown) {
		if (err instanceof Error && err.message.includes("UNIQUE")) {
			return { created: false };
		}
		throw err;
	}
}

/** Delete a binding. Returns true if it existed. */
export async function deleteBinding(
	db: D1Database,
	agentId: string,
	assetId: string,
): Promise<boolean> {
	const result = await db
		.prepare("DELETE FROM agent_asset_bindings WHERE agent_id = ? AND asset_id = ?")
		.bind(agentId, assetId)
		.run();
	return result.meta.changes > 0;
}

/** Check if an agent exists. */
export async function agentExists(db: D1Database, agentId: string): Promise<boolean> {
	const row = await db
		.prepare("SELECT 1 FROM agents WHERE id = ?")
		.bind(agentId)
		.first<{ 1: number }>();
	return row !== null;
}

/** Check if an asset exists. */
export async function assetExists(db: D1Database, assetId: string): Promise<boolean> {
	const row = await db
		.prepare("SELECT 1 FROM assets WHERE id = ?")
		.bind(assetId)
		.first<{ 1: number }>();
	return row !== null;
}

/** Full-graph read model for visualization. */
export async function getAssetMap(db: D1Database): Promise<AssetMapResponse> {
	// All queries run in parallel (D1 doesn't support parallel, but logically independent)
	const [hostRows, agents, assets, bindings, tags] = await Promise.all([
		db
			.prepare(
				"SELECT host_id, hostname, CASE WHEN is_active = 1 THEN 'active' ELSE 'inactive' END AS status FROM hosts",
			)
			.all<{ host_id: string; hostname: string; status: string }>(),
		db
			.prepare(
				"SELECT id, host_id, substr(source_key, 1, 8) AS source_key_short, nickname, runtime_app, status FROM agents",
			)
			.all<AssetMapAgent>(),
		db
			.prepare("SELECT id, host_id, type, subtype, name, provider, status FROM assets")
			.all<AssetMapAsset>(),
		db.prepare("SELECT agent_id, asset_id FROM agent_asset_bindings").all<AssetMapBinding>(),
		db
			.prepare(
				`SELECT 'agent' AS entity_type, at.agent_id AS entity_id, t.id AS tag_id, t.name AS tag_name, t.color AS tag_color
				 FROM agent_tags at JOIN tags t ON at.tag_id = t.id
				 UNION ALL
				 SELECT 'asset' AS entity_type, at2.asset_id AS entity_id, t2.id AS tag_id, t2.name AS tag_name, t2.color AS tag_color
				 FROM asset_tags at2 JOIN tags t2 ON at2.tag_id = t2.id
				 UNION ALL
				 SELECT 'host' AS entity_type, ht.host_id AS entity_id, t3.id AS tag_id, t3.name AS tag_name, t3.color AS tag_color
				 FROM host_tags ht JOIN tags t3 ON ht.tag_id = t3.id`,
			)
			.all<AssetMapTagEntry>(),
	]);

	return {
		hosts: hostRows.results.map((h) => ({
			host_id: h.host_id,
			hid: h.host_id.slice(0, 8),
			hostname: h.hostname,
			status: h.status,
		})),
		agents: agents.results,
		assets: assets.results,
		bindings: bindings.results,
		tags: tags.results,
	};
}

/** Lightweight overview counters. */
export async function getAssetsOverview(db: D1Database): Promise<AssetsOverview> {
	const [agentRows, assetRows, bindingCount] = await Promise.all([
		db
			.prepare("SELECT status, COUNT(*) AS cnt FROM agents GROUP BY status")
			.all<{ status: string; cnt: number }>(),
		db
			.prepare("SELECT type, status, COUNT(*) AS cnt FROM assets GROUP BY type, status")
			.all<{ type: string; status: string; cnt: number }>(),
		db.prepare("SELECT COUNT(*) AS cnt FROM agent_asset_bindings").first<{ cnt: number }>(),
	]);

	// Build agent overview
	const agentByStatus: Record<string, number> = {
		running: 0,
		stopped: 0,
		missing: 0,
		unknown: 0,
	};
	let agentTotal = 0;
	for (const row of agentRows.results) {
		agentByStatus[row.status] = (agentByStatus[row.status] ?? 0) + row.cnt;
		agentTotal += row.cnt;
	}

	// Build asset overview
	const assetByType: Record<string, number> = {
		cloud_service: 0,
		domain: 0,
		container: 0,
		cli_tool: 0,
		mcp_service: 0,
	};
	const assetByStatus: Record<string, number> = {
		active: 0,
		inactive: 0,
		missing: 0,
		unknown: 0,
	};
	let assetTotal = 0;
	for (const row of assetRows.results) {
		assetByType[row.type] = (assetByType[row.type] ?? 0) + row.cnt;
		assetByStatus[row.status] = (assetByStatus[row.status] ?? 0) + row.cnt;
		assetTotal += row.cnt;
	}

	return {
		agents: {
			total: agentTotal,
			by_status: agentByStatus as AssetsOverview["agents"]["by_status"],
		},
		assets: {
			total: assetTotal,
			by_type: assetByType as AssetsOverview["assets"]["by_type"],
			by_status: assetByStatus as AssetsOverview["assets"]["by_status"],
		},
		bindings: bindingCount?.cnt ?? 0,
	};
}
