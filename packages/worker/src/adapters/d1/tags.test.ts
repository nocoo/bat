// Tags repository contract tests. SQL behaviour is unchanged from the
// prior inline route statements.

import { MAX_TAGS_PER_HOST } from "@bat/shared";
import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../../test-helpers/mock-d1";
import { D1TagsRepository } from "./tags";

const HOST_A = "host-a";
const HOST_B = "host-b";
const NOW = 1_730_000_000;

async function seedHosts(db: D1Database) {
	await db
		.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, 1)")
		.bind(HOST_A, "a.example.com", NOW)
		.run();
	await db
		.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, 1)")
		.bind(HOST_B, "b.example.com", NOW)
		.run();
}

describe("D1TagsRepository", () => {
	let db: D1Database;
	let repo: D1TagsRepository;
	beforeEach(async () => {
		db = createMockD1();
		await seedHosts(db);
		repo = new D1TagsRepository(db);
	});

	describe("create", () => {
		test("inserts with explicit color", async () => {
			const r = await repo.create("prod", 3);
			expect(r.ok).toBe(true);
			if (r.ok !== true) {
				return;
			}
			expect(r.row.name).toBe("prod");
			expect(r.row.color).toBe(3);
		});

		test("rotates color when null is passed", async () => {
			const a = await repo.create("a", null);
			const b = await repo.create("b", null);
			expect(a.ok).toBe(true);
			expect(b.ok).toBe(true);
			if (a.ok !== true || b.ok !== true) {
				return;
			}
			expect(a.row.color).toBe(0);
			expect(b.row.color).toBe(1);
		});

		test("returns duplicate on UNIQUE name conflict", async () => {
			expect((await repo.create("dup", 0)).ok).toBe(true);
			const r = await repo.create("dup", 1);
			expect(r.ok).toBe("duplicate");
		});
	});

	describe("update", () => {
		test("renames a tag", async () => {
			const created = await repo.create("old", 0);
			expect(created.ok).toBe(true);
			if (created.ok !== true) {
				return;
			}
			const r = await repo.update(created.row.id, { name: "new" });
			expect(r.ok).toBe(true);
			if (r.ok !== true) {
				return;
			}
			expect(r.row.name).toBe("new");
		});

		test("recolors a tag", async () => {
			const created = await repo.create("c", 0);
			expect(created.ok).toBe(true);
			if (created.ok !== true) {
				return;
			}
			const r = await repo.update(created.row.id, { color: 5 });
			expect(r.ok).toBe(true);
			if (r.ok !== true) {
				return;
			}
			expect(r.row.color).toBe(5);
		});

		test("returns not_found for missing id", async () => {
			expect((await repo.update(9999, { name: "x" })).ok).toBe("not_found");
		});

		test("returns duplicate when renaming onto an existing name", async () => {
			expect((await repo.create("a", 0)).ok).toBe(true);
			const b = await repo.create("b", 1);
			expect(b.ok).toBe(true);
			if (b.ok !== true) {
				return;
			}
			expect((await repo.update(b.row.id, { name: "a" })).ok).toBe("duplicate");
		});

		test("returns not_found when fields object is empty", async () => {
			expect((await repo.update(1, {})).ok).toBe("not_found");
		});
	});

	describe("delete", () => {
		test("returns true on hit, false on miss", async () => {
			const created = await repo.create("d", 0);
			expect(created.ok).toBe(true);
			if (created.ok !== true) {
				return;
			}
			expect(await repo.delete(created.row.id)).toBe(true);
			expect(await repo.delete(created.row.id)).toBe(false);
		});

		test("cascade removes host_tags edges", async () => {
			const created = await repo.create("c", 0);
			expect(created.ok).toBe(true);
			if (created.ok !== true) {
				return;
			}
			const tagId = created.row.id;
			expect((await repo.addToHost(HOST_A, tagId)).ok).toBe(true);
			expect(await repo.delete(tagId)).toBe(true);
			expect(await repo.listForHost(HOST_A)).toEqual([]);
		});
	});

	describe("list", () => {
		test("returns tags with host_count, ordered by name", async () => {
			const a = await repo.create("alpha", 0);
			const b = await repo.create("beta", 1);
			expect(a.ok).toBe(true);
			expect(b.ok).toBe(true);
			if (a.ok !== true || b.ok !== true) {
				return;
			}
			expect((await repo.addToHost(HOST_A, a.row.id)).ok).toBe(true);
			expect((await repo.addToHost(HOST_B, a.row.id)).ok).toBe(true);
			const list = await repo.list();
			expect(list.map((t) => t.name)).toEqual(["alpha", "beta"]);
			const alpha = list.find((t) => t.name === "alpha");
			expect(alpha?.host_count).toBe(2);
			expect(list.find((t) => t.name === "beta")?.host_count).toBe(0);
		});
	});

	describe("byHostsAll", () => {
		test("groups tags by host_id, tags ordered by name", async () => {
			const a = await repo.create("alpha", 0);
			const b = await repo.create("beta", 1);
			expect(a.ok).toBe(true);
			expect(b.ok).toBe(true);
			if (a.ok !== true || b.ok !== true) {
				return;
			}
			expect((await repo.addToHost(HOST_A, b.row.id)).ok).toBe(true);
			expect((await repo.addToHost(HOST_A, a.row.id)).ok).toBe(true);
			expect((await repo.addToHost(HOST_B, a.row.id)).ok).toBe(true);
			const map = await repo.byHostsAll();
			expect(map[HOST_A]?.map((t) => t.name)).toEqual(["alpha", "beta"]);
			expect(map[HOST_B]?.map((t) => t.name)).toEqual(["alpha"]);
		});
	});

	describe("addToHost", () => {
		test("returns host_not_found for missing host", async () => {
			expect((await repo.addToHost("ghost", 1)).ok).toBe("host_not_found");
		});

		test("returns tag_not_found for missing tag", async () => {
			expect((await repo.addToHost(HOST_A, 9999)).ok).toBe("tag_not_found");
		});

		test("returns limit_exceeded once a host has the maximum number of tags", async () => {
			for (let i = 0; i < MAX_TAGS_PER_HOST; i++) {
				const t = await repo.create(`t${i}`, i);
				expect(t.ok).toBe(true);
				if (t.ok !== true) {
					return;
				}
				expect((await repo.addToHost(HOST_A, t.row.id)).ok).toBe(true);
			}
			const overflow = await repo.create("overflow", 0);
			expect(overflow.ok).toBe(true);
			if (overflow.ok !== true) {
				return;
			}
			const r = await repo.addToHost(HOST_A, overflow.row.id);
			expect(r.ok).toBe("limit_exceeded");
			if (r.ok !== "limit_exceeded") {
				return;
			}
			expect(r.max).toBe(MAX_TAGS_PER_HOST);
		});

		test("idempotent on duplicate add", async () => {
			const t = await repo.create("x", 0);
			expect(t.ok).toBe(true);
			if (t.ok !== true) {
				return;
			}
			expect((await repo.addToHost(HOST_A, t.row.id)).ok).toBe(true);
			expect((await repo.addToHost(HOST_A, t.row.id)).ok).toBe(true);
			expect((await repo.listForHost(HOST_A)).length).toBe(1);
		});
	});

	describe("replaceForHost", () => {
		test("DELETE-then-INSERT replaces the set", async () => {
			const t1 = await repo.create("a", 0);
			const t2 = await repo.create("b", 1);
			const t3 = await repo.create("c", 2);
			if (t1.ok !== true || t2.ok !== true || t3.ok !== true) {
				return;
			}
			expect((await repo.addToHost(HOST_A, t1.row.id)).ok).toBe(true);
			const r = await repo.replaceForHost(HOST_A, [t2.row.id, t3.row.id]);
			expect(r.ok).toBe(true);
			if (r.ok !== true) {
				return;
			}
			expect(r.tags.map((t) => t.name)).toEqual(["b", "c"]);
		});

		test("clears the set when given empty array", async () => {
			const t = await repo.create("x", 0);
			expect(t.ok).toBe(true);
			if (t.ok !== true) {
				return;
			}
			expect((await repo.addToHost(HOST_A, t.row.id)).ok).toBe(true);
			const r = await repo.replaceForHost(HOST_A, []);
			expect(r.ok).toBe(true);
			if (r.ok !== true) {
				return;
			}
			expect(r.tags).toEqual([]);
		});

		test("returns host_not_found for missing host", async () => {
			expect((await repo.replaceForHost("ghost", [])).ok).toBe("host_not_found");
		});

		test("returns tags_not_found with the missing list", async () => {
			const t = await repo.create("a", 0);
			expect(t.ok).toBe(true);
			if (t.ok !== true) {
				return;
			}
			const r = await repo.replaceForHost(HOST_A, [t.row.id, 9998, 9999]);
			expect(r.ok).toBe("tags_not_found");
			if (r.ok !== "tags_not_found") {
				return;
			}
			expect(r.missing.sort()).toEqual([9998, 9999]);
		});
	});

	describe("removeFromHost", () => {
		test("returns true on hit, false on miss", async () => {
			const t = await repo.create("x", 0);
			expect(t.ok).toBe(true);
			if (t.ok !== true) {
				return;
			}
			expect((await repo.addToHost(HOST_A, t.row.id)).ok).toBe(true);
			expect(await repo.removeFromHost(HOST_A, t.row.id)).toBe(true);
			expect(await repo.removeFromHost(HOST_A, t.row.id)).toBe(false);
		});
	});

	describe("listForHost", () => {
		test("returns tags ordered by name", async () => {
			const a = await repo.create("alpha", 0);
			const b = await repo.create("beta", 1);
			if (a.ok !== true || b.ok !== true) {
				return;
			}
			expect((await repo.addToHost(HOST_A, b.row.id)).ok).toBe(true);
			expect((await repo.addToHost(HOST_A, a.row.id)).ok).toBe(true);
			const tags = await repo.listForHost(HOST_A);
			expect(tags.map((t) => t.name)).toEqual(["alpha", "beta"]);
		});

		test("returns empty array for an unknown host (no FK enforcement here)", async () => {
			expect(await repo.listForHost("ghost")).toEqual([]);
		});
	});
});
