// BindingsRepository contract tests. SQL behaviour is unchanged from
// the pre-C5 services/bindings.ts implementation.

import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../../test-helpers/mock-d1";
import { D1AssetsRepository } from "./assets";
import { D1BindingsRepository } from "./bindings";

const HOST_A = "host-a";
const NOW = 1_730_000_000;

async function seedHost(db: D1Database) {
	await db
		.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, 1)")
		.bind(HOST_A, "a.example.com", NOW)
		.run();
}

async function seedAgent(db: D1Database, id: string, nickname?: string) {
	await db
		.prepare(
			"INSERT INTO agents (id, source_key, match_key, nickname, status, metadata) VALUES (?, ?, ?, ?, 'running', '{}')",
		)
		.bind(id, `sk_${id}`, `mk_${id}`, nickname ?? null)
		.run();
}

describe("D1BindingsRepository", () => {
	let db: D1Database;
	let repo: D1BindingsRepository;
	let assets: D1AssetsRepository;
	beforeEach(async () => {
		db = createMockD1();
		await seedHost(db);
		repo = new D1BindingsRepository(db);
		assets = new D1AssetsRepository(db);
	});

	describe("create + list + delete", () => {
		test("creates idempotently and lists with denormalized fields", async () => {
			await seedAgent(db, "agt_1", "main-agent");
			await assets.create({ id: "ast_1", type: "cli_tool", name: "tool", host_id: HOST_A });

			const first = await repo.create("agt_1", "ast_1");
			expect(first.created).toBe(true);
			const second = await repo.create("agt_1", "ast_1");
			expect(second.created).toBe(false);

			const list = await repo.list();
			expect(list.length).toBe(1);
			expect(list[0]).toMatchObject({
				agent_id: "agt_1",
				asset_id: "ast_1",
				agent_nickname: "main-agent",
				asset_name: "tool",
				asset_type: "cli_tool",
			});
		});

		test("list orders by created_at DESC", async () => {
			await seedAgent(db, "agt_a");
			await seedAgent(db, "agt_b");
			await assets.create({ id: "ast_a", type: "cli_tool", name: "a" });
			await assets.create({ id: "ast_b", type: "cli_tool", name: "b" });
			expect((await repo.create("agt_a", "ast_a")).created).toBe(true);
			await new Promise((r) => setTimeout(r, 1100));
			expect((await repo.create("agt_b", "ast_b")).created).toBe(true);
			const list = await repo.list();
			expect(list.map((b) => b.agent_id)).toEqual(["agt_b", "agt_a"]);
		});

		test("delete returns true on hit, false on miss", async () => {
			await seedAgent(db, "agt_d");
			await assets.create({ id: "ast_d", type: "cli_tool", name: "d" });
			expect((await repo.create("agt_d", "ast_d")).created).toBe(true);
			expect(await repo.delete("agt_d", "ast_d")).toBe(true);
			expect(await repo.delete("agt_d", "ast_d")).toBe(false);
		});
	});

	describe("FK helpers", () => {
		test("agentExists / assetExists reflect presence", async () => {
			await seedAgent(db, "agt_x");
			await assets.create({ id: "ast_x", type: "cli_tool", name: "x" });
			expect(await repo.agentExists("agt_x")).toBe(true);
			expect(await repo.agentExists("ghost")).toBe(false);
			expect(await repo.assetExists("ast_x")).toBe(true);
			expect(await repo.assetExists("ghost")).toBe(false);
		});
	});

	describe("getAssetMap", () => {
		test("returns full graph with hosts/agents/assets/bindings/tags", async () => {
			await seedAgent(db, "agt_m", "m");
			await assets.create({ id: "ast_m", type: "cli_tool", name: "m", host_id: HOST_A });
			await db
				.prepare("INSERT INTO tags (id, name, color) VALUES (?, ?, ?)")
				.bind(1, "prod", 0)
				.run();
			await db
				.prepare("INSERT INTO host_tags (host_id, tag_id) VALUES (?, ?)")
				.bind(HOST_A, 1)
				.run();
			await db
				.prepare("INSERT INTO asset_tags (asset_id, tag_id) VALUES (?, ?)")
				.bind("ast_m", 1)
				.run();
			expect((await repo.create("agt_m", "ast_m")).created).toBe(true);

			const map = await repo.getAssetMap();
			expect(map.hosts.length).toBe(1);
			expect(map.hosts[0]?.hid).toMatch(/^[0-9a-f]{8}$/);
			expect(map.agents.map((a) => a.id)).toEqual(["agt_m"]);
			expect(map.assets.map((a) => a.id)).toEqual(["ast_m"]);
			expect(map.bindings).toEqual([{ agent_id: "agt_m", asset_id: "ast_m" }]);
			const tagKinds = map.tags.map((t) => t.entity_type).sort();
			expect(tagKinds).toEqual(["asset", "host"]);
		});

		test("empty graph yields empty arrays", async () => {
			await db.prepare("DELETE FROM hosts").run();
			const map = await repo.getAssetMap();
			expect(map).toEqual({ hosts: [], agents: [], assets: [], bindings: [], tags: [] });
		});
	});

	describe("getOverview", () => {
		test("aggregates counts by status/type and total bindings", async () => {
			await seedAgent(db, "agt_o");
			await assets.create({ id: "ast_a", type: "cli_tool", name: "a" });
			await assets.create({ id: "ast_b", type: "domain", name: "b", status: "inactive" });
			expect((await repo.create("agt_o", "ast_a")).created).toBe(true);

			const ov = await repo.getOverview();
			expect(ov.agents.total).toBe(1);
			expect(ov.agents.by_status.running).toBe(1);
			expect(ov.assets.total).toBe(2);
			expect(ov.assets.by_type.cli_tool).toBe(1);
			expect(ov.assets.by_type.domain).toBe(1);
			expect(ov.assets.by_status.active).toBe(1);
			expect(ov.assets.by_status.inactive).toBe(1);
			expect(ov.bindings).toBe(1);
		});

		test("returns zeros when DB is empty", async () => {
			const ov = await repo.getOverview();
			expect(ov.agents.total).toBe(0);
			expect(ov.assets.total).toBe(0);
			expect(ov.bindings).toBe(0);
		});
	});
});
