// CliTokensRepository contract tests. SQL behaviour is unchanged from
// the pre-C6 services/cli-tokens.ts implementation.

import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../../test-helpers/mock-d1";
import { D1CliTokensRepository } from "./cli-tokens";

const HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("D1CliTokensRepository", () => {
	let db: D1Database;
	let repo: D1CliTokensRepository;
	beforeEach(() => {
		db = createMockD1();
		repo = new D1CliTokensRepository(db);
	});

	describe("create + list", () => {
		test("create inserts and returns the row", async () => {
			const row = await repo.create(HASH, "primary", "assets");
			expect(row.token_hash).toBe(HASH);
			expect(row.label).toBe("primary");
			expect(row.scope).toBe("assets");
			expect(row.last_used_at).toBeNull();
		});

		test("list returns all tokens ordered by created_at desc", async () => {
			const a = await repo.create(`${HASH.slice(0, -1)}0`, "a", "assets");
			await new Promise((r) => setTimeout(r, 1100));
			const b = await repo.create(`${HASH.slice(0, -1)}1`, "b", "assets");
			const list = await repo.list();
			expect(list.map((t) => t.id)).toEqual([b.id, a.id]);
		});
	});

	describe("delete", () => {
		test("returns true on hit, false on miss", async () => {
			const row = await repo.create(HASH, "x", "assets");
			expect(await repo.delete(row.id)).toBe(true);
			expect(await repo.delete(row.id)).toBe(false);
			expect(await repo.delete(9999)).toBe(false);
		});
	});

	describe("findByHashAndTouch", () => {
		test("returns null on miss", async () => {
			expect(await repo.findByHashAndTouch("not-a-hash")).toBeNull();
		});

		test("returns row on hit and bumps last_used_at", async () => {
			const created = await repo.create(HASH, "lookup", "assets");
			expect(created.last_used_at).toBeNull();
			const fetched = await repo.findByHashAndTouch(HASH);
			expect(fetched?.id).toBe(created.id);
			// Re-read directly to confirm last_used_at is set
			const after = await db
				.prepare("SELECT last_used_at FROM cli_tokens WHERE id = ?")
				.bind(created.id)
				.first<{ last_used_at: number | null }>();
			expect(after?.last_used_at).not.toBeNull();
		});
	});
});
