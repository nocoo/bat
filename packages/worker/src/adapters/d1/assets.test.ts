// AssetsRepository contract tests. SQL behaviour is unchanged from the
// pre-C5 services/assets.ts implementation.

import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../../test-helpers/mock-d1";
import { D1AssetsRepository } from "./assets";

const HOST_A = "host-a";
const NOW = 1_730_000_000;

async function seedHost(db: D1Database) {
	await db
		.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, 1)")
		.bind(HOST_A, "a.example.com", NOW)
		.run();
}

async function seedTags(db: D1Database, ids: number[]) {
	for (const id of ids) {
		await db
			.prepare("INSERT INTO tags (id, name, color) VALUES (?, ?, 0)")
			.bind(id, `t${id}`)
			.run();
	}
}

describe("D1AssetsRepository", () => {
	let db: D1Database;
	let repo: D1AssetsRepository;
	beforeEach(async () => {
		db = createMockD1();
		await seedHost(db);
		repo = new D1AssetsRepository(db);
	});

	describe("create + getById + list", () => {
		test("create then read back through getById, list", async () => {
			await repo.create({
				id: "ast_1",
				host_id: HOST_A,
				type: "cli_tool",
				name: "first",
			});
			const item = await repo.getById("ast_1");
			expect(item).not.toBeNull();
			expect(item?.id).toBe("ast_1");
			expect(item?.name).toBe("first");
			expect(item?.host_id).toBe(HOST_A);
			expect(item?.hostname).toBe("a.example.com");
			expect(item?.status).toBe("active");
			expect(item?.metadata).toEqual({});
			expect(item?.tags).toEqual([]);

			const list = await repo.list();
			expect(list.length).toBe(1);
			expect(list[0]?.id).toBe("ast_1");
		});

		test("list orders by created_at DESC", async () => {
			await repo.create({ id: "ast_a", type: "cli_tool", name: "a" });
			await new Promise((r) => setTimeout(r, 1100));
			await repo.create({ id: "ast_b", type: "cli_tool", name: "b" });
			const list = await repo.list();
			expect(list.map((a) => a.id)).toEqual(["ast_b", "ast_a"]);
		});

		test("getById returns null for missing id", async () => {
			expect(await repo.getById("ghost")).toBeNull();
		});

		test("create stores metadata JSON and parses it back", async () => {
			await repo.create({
				id: "ast_m",
				type: "cli_tool",
				name: "m",
				metadata: JSON.stringify({ k: "v" }),
			});
			const item = await repo.getById("ast_m");
			expect(item?.metadata).toEqual({ k: "v" });
		});
	});

	describe("update", () => {
		beforeEach(async () => {
			await repo.create({ id: "ast_u", type: "cli_tool", name: "orig" });
		});

		test("renames and bumps updated_at", async () => {
			await new Promise((r) => setTimeout(r, 1100));
			const row = await repo.update("ast_u", { name: "renamed" });
			expect(row).not.toBeNull();
			expect(row?.name).toBe("renamed");
		});

		test("status change reflects in getById", async () => {
			await repo.update("ast_u", { status: "inactive" });
			expect((await repo.getById("ast_u"))?.status).toBe("inactive");
		});

		test("returns null for missing id", async () => {
			expect(await repo.update("ghost", { name: "x" })).toBeNull();
		});

		test("empty fields returns the current row unchanged", async () => {
			const row = await repo.update("ast_u", {});
			expect(row?.id).toBe("ast_u");
			expect(row?.name).toBe("orig");
		});
	});

	describe("delete", () => {
		test("returns true on hit, false on miss; cascade clears asset_tags", async () => {
			await seedTags(db, [1]);
			await repo.create({ id: "ast_d", type: "cli_tool", name: "d" });
			expect((await repo.replaceTags("ast_d", [1])).ok).toBe(true);
			expect((await repo.getById("ast_d"))?.tags.length).toBe(1);

			expect(await repo.delete("ast_d")).toBe(true);
			expect(await repo.delete("ast_d")).toBe(false);

			const orphans = await db
				.prepare("SELECT COUNT(*) as cnt FROM asset_tags WHERE asset_id = ?")
				.bind("ast_d")
				.first<{ cnt: number }>();
			expect(orphans?.cnt).toBe(0);
		});
	});

	describe("hostExists", () => {
		test("true for seeded host, false otherwise", async () => {
			expect(await repo.hostExists(HOST_A)).toBe(true);
			expect(await repo.hostExists("ghost")).toBe(false);
		});
	});

	describe("replaceTags", () => {
		beforeEach(async () => {
			await repo.create({ id: "ast_t", type: "cli_tool", name: "t" });
			await seedTags(db, [1, 2, 3]);
		});

		test("DELETE-then-INSERT replaces the set", async () => {
			expect((await repo.replaceTags("ast_t", [1, 2])).ok).toBe(true);
			expect((await repo.getById("ast_t"))?.tags.map((t) => t.id).sort()).toEqual([1, 2]);
			expect((await repo.replaceTags("ast_t", [3])).ok).toBe(true);
			expect((await repo.getById("ast_t"))?.tags.map((t) => t.id)).toEqual([3]);
		});

		test("empty array clears the set", async () => {
			expect((await repo.replaceTags("ast_t", [1, 2])).ok).toBe(true);
			expect((await repo.replaceTags("ast_t", [])).ok).toBe(true);
			expect((await repo.getById("ast_t"))?.tags).toEqual([]);
		});

		test("returns tags_not_found with the missing list", async () => {
			const r = await repo.replaceTags("ast_t", [1, 99, 100]);
			expect(r.ok).toBe("tags_not_found");
			if (r.ok !== "tags_not_found") {
				return;
			}
			expect([...r.missing].sort((a, b) => a - b)).toEqual([99, 100]);
		});
	});
});
