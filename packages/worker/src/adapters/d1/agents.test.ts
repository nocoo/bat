// AgentsRepository contract tests. SQL behaviour is unchanged from the
// pre-C6 services/agents.ts and services/heartbeat.ts implementations.

import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../../test-helpers/mock-d1";
import { D1AgentsRepository } from "./agents";

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

describe("D1AgentsRepository", () => {
	let db: D1Database;
	let repo: D1AgentsRepository;
	beforeEach(async () => {
		db = createMockD1();
		await seedHost(db);
		repo = new D1AgentsRepository(db);
	});

	describe("upsertBy + getById", () => {
		test("first call creates and returns created=true", async () => {
			const r = await repo.upsertBy({ source_key: "sk", match_key: "mk" }, {});
			expect(r.created).toBe(true);
			const item = await repo.getById(r.id);
			expect(item?.source_key_short).toBe("sk");
			expect(item?.match_key).toBe("mk");
			expect(item?.status).toBe("unknown");
		});

		test("repeat call with same (source_key, match_key) returns same id and created=false", async () => {
			const a = await repo.upsertBy(
				{ source_key: "sk", match_key: "mk", status: "running" },
				{ status: "running" },
			);
			const b = await repo.upsertBy(
				{ source_key: "sk", match_key: "mk", status: "running" },
				{ status: "running" },
			);
			expect(b.created).toBe(false);
			expect(b.id).toBe(a.id);
		});

		test("conflict updates only specified fields", async () => {
			const a = await repo.upsertBy({ source_key: "sk", match_key: "mk", nickname: "alpha" }, {});
			await repo.upsertBy(
				{ source_key: "sk", match_key: "mk", nickname: "should-not-clobber" },
				{ status: "stopped" },
			);
			const item = await repo.getById(a.id);
			expect(item?.status).toBe("stopped");
			expect(item?.nickname).toBe("alpha");
		});
	});

	describe("update + delete", () => {
		test("update partial; delete returns true on hit", async () => {
			const r = await repo.upsertBy({ source_key: "sk", match_key: "mk" }, {});
			const u = await repo.update(r.id, { nickname: "renamed" });
			expect(u?.nickname).toBe("renamed");
			expect(await repo.delete(r.id)).toBe(true);
			expect(await repo.delete(r.id)).toBe(false);
			expect(await repo.getById(r.id)).toBeNull();
		});

		test("update with no fields returns the current row", async () => {
			const r = await repo.upsertBy({ source_key: "sk", match_key: "mk", nickname: "x" }, {});
			const row = await repo.update(r.id, {});
			expect(row?.nickname).toBe("x");
		});
	});

	describe("hostExists", () => {
		test("true for seeded host, false otherwise", async () => {
			expect(await repo.hostExists(HOST_A)).toBe(true);
			expect(await repo.hostExists("ghost")).toBe(false);
		});
	});

	describe("replaceTags", () => {
		test("replaces, clears, and reports missing", async () => {
			await seedTags(db, [1, 2, 3]);
			const r = await repo.upsertBy({ source_key: "sk", match_key: "mk" }, {});
			expect((await repo.replaceTags(r.id, [1, 2])).ok).toBe(true);
			expect((await repo.getById(r.id))?.tags.map((t) => t.id).sort()).toEqual([1, 2]);
			expect((await repo.replaceTags(r.id, [])).ok).toBe(true);
			expect((await repo.getById(r.id))?.tags).toEqual([]);
			const miss = await repo.replaceTags(r.id, [1, 99]);
			expect(miss.ok).toBe("tags_not_found");
			if (miss.ok !== "tags_not_found") {
				return;
			}
			expect(miss.missing).toEqual([99]);
		});
	});

	describe("processHeartbeat", () => {
		test("creates new agents for unreported match_keys, updates existing, marks unreported as missing", async () => {
			// Seed two existing agents under the same source_key.
			const a = await repo.upsertBy(
				{ source_key: "src1", match_key: "alpha", status: "running" },
				{},
			);
			const b = await repo.upsertBy(
				{ source_key: "src1", match_key: "beta", status: "running" },
				{},
			);

			// Heartbeat reports `alpha` (running), introduces `gamma`, omits `beta`.
			const result = await repo.processHeartbeat(
				"src1",
				[
					{ match_key: "alpha", status: "running" },
					{ match_key: "gamma", status: "running", runtime_app: "claude" },
				],
				NOW + 60,
			);
			expect(result).toEqual({ updated: 1, created: 1, missing: 1 });

			expect((await repo.getById(a.id))?.last_seen_at).toBe(NOW + 60);
			// beta is now missing
			const beta = await repo.getById(b.id);
			expect(beta?.status).toBe("missing");
			// gamma exists with runtime_app set
			const all = await repo.list();
			const gamma = all.find((x) => x.match_key === "gamma");
			expect(gamma?.runtime_app).toBe("claude");
		});

		test("re-running with the same report is idempotent (no-op missing count)", async () => {
			await repo.upsertBy({ source_key: "src2", match_key: "only", status: "running" }, {});
			const r1 = await repo.processHeartbeat(
				"src2",
				[{ match_key: "only", status: "running" }],
				NOW,
			);
			const r2 = await repo.processHeartbeat(
				"src2",
				[{ match_key: "only", status: "running" }],
				NOW + 1,
			);
			expect(r1.missing).toBe(0);
			expect(r2.missing).toBe(0);
			expect(r2.updated).toBe(1);
		});
	});
});
