// D1-backed AssetsRepository. SQL lifted verbatim from
// `services/assets.ts` (now removed). The pure DTO shaper `toAssetItem`
// is kept private to the adapter.

import type { AssetItem, AssetRow } from "@bat/shared";
import type { AssetsRepository } from "../../repos/types.js";

interface TagRef {
	id: number;
	name: string;
	color: number;
}

export class D1AssetsRepository implements AssetsRepository {
	private readonly db: D1Database;

	constructor(db: D1Database) {
		this.db = db;
	}

	async list(): Promise<AssetItem[]> {
		const rows = await this.db
			.prepare(
				`SELECT a.*, h.hostname
			 FROM assets a
			 LEFT JOIN hosts h ON a.host_id = h.host_id
			 ORDER BY a.created_at DESC`,
			)
			.all<AssetRow & { hostname: string | null }>();

		const assetIds = rows.results.map((r) => r.id);
		const tags = await this.loadAssetTags(assetIds);

		return rows.results.map((row) => toAssetItem(row, tags.get(row.id) ?? []));
	}

	async getById(id: string): Promise<AssetItem | null> {
		const row = await this.db
			.prepare(
				`SELECT a.*, h.hostname
			 FROM assets a
			 LEFT JOIN hosts h ON a.host_id = h.host_id
			 WHERE a.id = ?`,
			)
			.bind(id)
			.first<AssetRow & { hostname: string | null }>();

		if (!row) {
			return null;
		}
		const tags = await this.loadAssetTags([id]);
		return toAssetItem(row, tags.get(id) ?? []);
	}

	async create(params: {
		id: string;
		host_id?: string | null;
		type: string;
		subtype?: string | null;
		name: string;
		provider?: string | null;
		status?: string;
		metadata?: string;
	}): Promise<AssetRow> {
		const row = await this.db
			.prepare(
				`INSERT INTO assets (id, host_id, type, subtype, name, provider, status, metadata)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			 RETURNING *`,
			)
			.bind(
				params.id,
				params.host_id ?? null,
				params.type,
				params.subtype ?? null,
				params.name,
				params.provider ?? null,
				params.status ?? "active",
				params.metadata ?? "{}",
			)
			.first<AssetRow>();

		if (!row) {
			throw new Error("Failed to create asset");
		}
		return row;
	}

	async update(
		id: string,
		fields: {
			host_id?: string | null | undefined;
			name?: string | undefined;
			subtype?: string | null | undefined;
			provider?: string | null | undefined;
			status?: string | undefined;
			metadata?: string | undefined;
		},
	): Promise<AssetRow | null> {
		const setClauses: string[] = [];
		const bindings: unknown[] = [];

		if (fields.host_id !== undefined) {
			setClauses.push("host_id = ?");
			bindings.push(fields.host_id);
		}
		if (fields.name !== undefined) {
			setClauses.push("name = ?");
			bindings.push(fields.name);
		}
		if (fields.subtype !== undefined) {
			setClauses.push("subtype = ?");
			bindings.push(fields.subtype);
		}
		if (fields.provider !== undefined) {
			setClauses.push("provider = ?");
			bindings.push(fields.provider);
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
			return this.db.prepare("SELECT * FROM assets WHERE id = ?").bind(id).first<AssetRow>();
		}

		setClauses.push("updated_at = unixepoch()");
		bindings.push(id);
		return this.db
			.prepare(`UPDATE assets SET ${setClauses.join(", ")} WHERE id = ? RETURNING *`)
			.bind(...bindings)
			.first<AssetRow>();
	}

	async delete(id: string): Promise<boolean> {
		const result = await this.db.prepare("DELETE FROM assets WHERE id = ?").bind(id).run();
		return (result.meta?.changes ?? 0) > 0;
	}

	async replaceTags(
		assetId: string,
		tagIds: number[],
	): Promise<{ ok: true } | { ok: "tags_not_found"; missing: number[] }> {
		if (tagIds.length === 0) {
			await this.db.prepare("DELETE FROM asset_tags WHERE asset_id = ?").bind(assetId).run();
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
			this.db.prepare("DELETE FROM asset_tags WHERE asset_id = ?").bind(assetId),
			...tagIds.map((tagId) =>
				this.db
					.prepare("INSERT INTO asset_tags (asset_id, tag_id) VALUES (?, ?)")
					.bind(assetId, tagId),
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

	private async loadAssetTags(assetIds: string[]): Promise<Map<string, TagRef[]>> {
		const result = new Map<string, TagRef[]>();
		if (assetIds.length === 0) {
			return result;
		}

		const placeholders = assetIds.map(() => "?").join(",");
		const rows = await this.db
			.prepare(
				`SELECT at.asset_id, t.id, t.name, t.color
			 FROM asset_tags at
			 JOIN tags t ON at.tag_id = t.id
			 WHERE at.asset_id IN (${placeholders})`,
			)
			.bind(...assetIds)
			.all<{ asset_id: string; id: number; name: string; color: number }>();

		for (const row of rows.results) {
			const list = result.get(row.asset_id) ?? [];
			list.push({ id: row.id, name: row.name, color: row.color });
			result.set(row.asset_id, list);
		}
		return result;
	}
}

function toAssetItem(row: AssetRow & { hostname: string | null }, tags: TagRef[]): AssetItem {
	return {
		id: row.id,
		host_id: row.host_id,
		hostname: row.hostname,
		type: row.type,
		subtype: row.subtype,
		name: row.name,
		provider: row.provider,
		status: row.status,
		metadata: JSON.parse(row.metadata),
		tags,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}
