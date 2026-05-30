// D1-backed TagsRepository. SQL lifted verbatim from `routes/tags.ts`.
// Discriminated results map UNIQUE / FK / count-cap conditions onto
// route-level 404 / 409 / 422 so handlers stay free of inline SQL.

import { type HostTag, MAX_TAGS_PER_HOST, TAG_COLOR_COUNT } from "@bat/shared";
import type { TagsRepository } from "../../repos/types.js";

export class D1TagsRepository implements TagsRepository {
	private readonly db: D1Database;

	constructor(db: D1Database) {
		this.db = db;
	}

	async list(): Promise<Array<{ id: number; name: string; color: number; host_count: number }>> {
		const result = await this.db
			.prepare(
				`SELECT t.id, t.name, t.color,
			        (SELECT COUNT(*) FROM host_tags ht WHERE ht.tag_id = t.id) as host_count
			 FROM tags t
			 ORDER BY t.name ASC`,
			)
			.all<{ id: number; name: string; color: number; host_count: number }>();
		return result.results;
	}

	async create(
		name: string,
		color: number | null,
	): Promise<{ ok: true; row: { id: number; name: string; color: number } } | { ok: "duplicate" }> {
		try {
			const row =
				color !== null
					? await this.db
							.prepare("INSERT INTO tags (name, color) VALUES (?, ?) RETURNING id, name, color")
							.bind(name, color)
							.first<{ id: number; name: string; color: number }>()
					: await this.db
							.prepare(
								`INSERT INTO tags (name, color)
					 VALUES (?, (SELECT COALESCE(MAX(color), -1) + 1 FROM tags) % ?)
					 RETURNING id, name, color`,
							)
							.bind(name, TAG_COLOR_COUNT)
							.first<{ id: number; name: string; color: number }>();
			if (!row) {
				throw new Error("Failed to create tag");
			}
			return { ok: true, row };
		} catch (err) {
			if (err instanceof Error && err.message.includes("UNIQUE")) {
				return { ok: "duplicate" };
			}
			throw err;
		}
	}

	async update(
		id: number,
		fields: { name?: string; color?: number },
	): Promise<
		| { ok: true; row: { id: number; name: string; color: number } }
		| { ok: "not_found" }
		| { ok: "duplicate" }
	> {
		const sets: string[] = [];
		const values: unknown[] = [];
		if (fields.name !== undefined) {
			sets.push("name = ?");
			values.push(fields.name);
		}
		if (fields.color !== undefined) {
			sets.push("color = ?");
			values.push(fields.color);
		}
		if (sets.length === 0) {
			// Caller should validate "at least one field" before reaching here.
			return { ok: "not_found" };
		}
		values.push(id);

		try {
			const row = await this.db
				.prepare(`UPDATE tags SET ${sets.join(", ")} WHERE id = ? RETURNING id, name, color`)
				.bind(...values)
				.first<{ id: number; name: string; color: number }>();
			if (!row) {
				return { ok: "not_found" };
			}
			return { ok: true, row };
		} catch (err) {
			if (err instanceof Error && err.message.includes("UNIQUE")) {
				return { ok: "duplicate" };
			}
			throw err;
		}
	}

	async delete(id: number): Promise<boolean> {
		const result = await this.db.prepare("DELETE FROM tags WHERE id = ?").bind(id).run();
		return (result.meta?.changes ?? 0) > 0;
	}

	async byHostsAll(): Promise<Record<string, HostTag[]>> {
		const result = await this.db
			.prepare(
				`SELECT ht.host_id, t.id, t.name, t.color
			 FROM host_tags ht JOIN tags t ON t.id = ht.tag_id
			 ORDER BY t.name ASC`,
			)
			.all<{ host_id: string; id: number; name: string; color: number }>();
		const map: Record<string, HostTag[]> = {};
		for (const row of result.results) {
			const list = map[row.host_id] ?? [];
			list.push({ id: row.id, name: row.name, color: row.color });
			map[row.host_id] = list;
		}
		return map;
	}

	async listForHost(hostId: string): Promise<HostTag[]> {
		const result = await this.db
			.prepare(
				`SELECT t.id, t.name, t.color
			 FROM host_tags ht JOIN tags t ON t.id = ht.tag_id
			 WHERE ht.host_id = ?
			 ORDER BY t.name ASC`,
			)
			.bind(hostId)
			.all<HostTag>();
		return result.results;
	}

	async addToHost(
		hostId: string,
		tagId: number,
	): Promise<
		| { ok: true; tag: HostTag }
		| { ok: "host_not_found" }
		| { ok: "tag_not_found" }
		| { ok: "limit_exceeded"; max: number }
	> {
		if (!(await this.hostExists(hostId))) {
			return { ok: "host_not_found" };
		}

		const countRow = await this.db
			.prepare("SELECT COUNT(*) as cnt FROM host_tags WHERE host_id = ?")
			.bind(hostId)
			.first<{ cnt: number }>();
		if ((countRow?.cnt ?? 0) >= MAX_TAGS_PER_HOST) {
			return { ok: "limit_exceeded", max: MAX_TAGS_PER_HOST };
		}

		const tag = await this.db
			.prepare("SELECT id, name, color FROM tags WHERE id = ?")
			.bind(tagId)
			.first<HostTag>();
		if (!tag) {
			return { ok: "tag_not_found" };
		}

		await this.db
			.prepare("INSERT OR IGNORE INTO host_tags (host_id, tag_id) VALUES (?, ?)")
			.bind(hostId, tagId)
			.run();

		return { ok: true, tag };
	}

	async replaceForHost(
		hostId: string,
		tagIds: number[],
	): Promise<
		| { ok: true; tags: HostTag[] }
		| { ok: "host_not_found" }
		| { ok: "tags_not_found"; missing: number[] }
	> {
		if (!(await this.hostExists(hostId))) {
			return { ok: "host_not_found" };
		}

		if (tagIds.length > 0) {
			const placeholders = tagIds.map(() => "?").join(", ");
			const existingTags = await this.db
				.prepare(`SELECT id FROM tags WHERE id IN (${placeholders})`)
				.bind(...tagIds)
				.all<{ id: number }>();
			if (existingTags.results.length !== tagIds.length) {
				const found = new Set(existingTags.results.map((t) => t.id));
				const missing = tagIds.filter((id) => !found.has(id));
				return { ok: "tags_not_found", missing };
			}
		}

		await this.db.prepare("DELETE FROM host_tags WHERE host_id = ?").bind(hostId).run();

		if (tagIds.length > 0) {
			const placeholders = tagIds.map(() => "(?, ?)").join(", ");
			const values = tagIds.flatMap((tagId) => [hostId, tagId]);
			await this.db
				.prepare(`INSERT OR IGNORE INTO host_tags (host_id, tag_id) VALUES ${placeholders}`)
				.bind(...values)
				.run();
		}

		const tags = await this.listForHost(hostId);
		return { ok: true, tags };
	}

	async removeFromHost(hostId: string, tagId: number): Promise<boolean> {
		const result = await this.db
			.prepare("DELETE FROM host_tags WHERE host_id = ? AND tag_id = ?")
			.bind(hostId, tagId)
			.run();
		return (result.meta?.changes ?? 0) > 0;
	}

	async listNamesForHosts(hostIds: string[]): Promise<Map<string, string[]>> {
		if (hostIds.length === 0) {
			return new Map();
		}
		const placeholders = hostIds.map(() => "?").join(", ");
		const result = await this.db
			.prepare(
				`SELECT ht.host_id, t.name FROM host_tags ht JOIN tags t ON ht.tag_id = t.id WHERE ht.host_id IN (${placeholders}) ORDER BY t.name ASC`,
			)
			.bind(...hostIds)
			.all<{ host_id: string; name: string }>();
		const map = new Map<string, string[]>();
		for (const row of result.results) {
			const list = map.get(row.host_id);
			if (list) {
				list.push(row.name);
			} else {
				map.set(row.host_id, [row.name]);
			}
		}
		return map;
	}

	private async hostExists(hostId: string): Promise<boolean> {
		const row = await this.db
			.prepare("SELECT host_id FROM hosts WHERE host_id = ?")
			.bind(hostId)
			.first<{ host_id: string }>();
		return row !== null;
	}
}
