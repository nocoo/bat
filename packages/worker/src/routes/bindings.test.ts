// Tests for Binding CRUD + Map/Overview routes
import { hashHostId } from "@bat/shared";
import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../test-helpers/mock-d1.js";
import {
	assetsMapRoute,
	assetsOverviewRoute,
	bindingsCreateRoute,
	bindingsDeleteRoute,
	bindingsListRoute,
} from "./bindings.js";

// --- Helpers ---

function makeCtx(
	db: D1Database,
	opts: {
		params?: Record<string, string>;
		body?: unknown;
		rawBody?: string;
	} = {},
) {
	const rawText =
		opts.rawBody !== undefined
			? opts.rawBody
			: opts.body !== undefined
				? JSON.stringify(opts.body)
				: "";
	return {
		env: { DB: db, BAT_WRITE_KEY: "write-key", BAT_READ_KEY: "read-key" },
		req: {
			param: (key: string) => opts.params?.[key],
			text: async () => rawText,
		},
		json: (data: unknown, status?: number) =>
			new Response(JSON.stringify(data), {
				status: status ?? 200,
				headers: { "Content-Type": "application/json" },
			}),
		body: (_data: unknown, status?: number) => new Response(null, { status: status ?? 200 }),
		// biome-ignore lint/suspicious/noExplicitAny: test helper
	} as any;
}

async function insertAgent(db: D1Database, id: string, nickname?: string) {
	await db
		.prepare(
			"INSERT INTO agents (id, source_key, match_key, nickname, status, metadata) VALUES (?, ?, ?, ?, 'running', '{}')",
		)
		.bind(id, `sk_${id}`, `mk_${id}`, nickname ?? null)
		.run();
}

async function insertAsset(db: D1Database, id: string, name: string, type = "cli_tool") {
	await db
		.prepare(
			"INSERT INTO assets (id, type, name, status, metadata) VALUES (?, ?, ?, 'active', '{}')",
		)
		.bind(id, type, name)
		.run();
}

async function insertHost(db: D1Database, hostId: string, hostname = "test-host") {
	await db
		.prepare(
			"INSERT INTO hosts (host_id, hostname, last_seen, is_active, created_at) VALUES (?, ?, unixepoch(), 1, unixepoch())",
		)
		.bind(hostId, hostname)
		.run();
}

async function insertTag(db: D1Database, id: number, name: string, color = 0) {
	await db
		.prepare("INSERT INTO tags (id, name, color) VALUES (?, ?, ?)")
		.bind(id, name, color)
		.run();
}

async function parseJson(res: Response) {
	return JSON.parse(await res.text());
}

// --- Binding CRUD ---

describe("POST /api/bindings (create)", () => {
	let db: D1Database;

	beforeEach(async () => {
		db = createMockD1();
		await insertAgent(db, "agt_1", "agent-one");
		await insertAsset(db, "ast_1", "asset-one");
	});

	test("creates binding → 201", async () => {
		const ctx = makeCtx(db, {
			body: { agent_id: "agt_1", asset_id: "ast_1" },
		});
		const res = await bindingsCreateRoute(ctx);
		expect(res.status).toBe(201);
		const data = await parseJson(res);
		expect(data.agent_id).toBe("agt_1");
		expect(data.asset_id).toBe("ast_1");
	});

	test("duplicate binding → 200 (idempotent)", async () => {
		const ctx1 = makeCtx(db, {
			body: { agent_id: "agt_1", asset_id: "ast_1" },
		});
		await bindingsCreateRoute(ctx1);

		const ctx2 = makeCtx(db, {
			body: { agent_id: "agt_1", asset_id: "ast_1" },
		});
		const res = await bindingsCreateRoute(ctx2);
		expect(res.status).toBe(200);
	});

	test("returns 400 if agent_id is missing", async () => {
		const ctx = makeCtx(db, { body: { asset_id: "ast_1" } });
		const res = await bindingsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("agent_id");
	});

	test("returns 400 if asset_id is missing", async () => {
		const ctx = makeCtx(db, { body: { agent_id: "agt_1" } });
		const res = await bindingsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("asset_id");
	});

	test("returns 400 if agent_id FK does not exist", async () => {
		const ctx = makeCtx(db, {
			body: { agent_id: "agt_nonexistent", asset_id: "ast_1" },
		});
		const res = await bindingsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("agent_id");
	});

	test("returns 400 if asset_id FK does not exist", async () => {
		const ctx = makeCtx(db, {
			body: { agent_id: "agt_1", asset_id: "ast_nonexistent" },
		});
		const res = await bindingsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("asset_id");
	});

	test("returns 400 for empty body", async () => {
		const ctx = makeCtx(db, { rawBody: "" });
		const res = await bindingsCreateRoute(ctx);
		expect(res.status).toBe(400);
	});

	test("returns 400 for non-JSON body", async () => {
		const ctx = makeCtx(db, { rawBody: "nope" });
		const res = await bindingsCreateRoute(ctx);
		expect(res.status).toBe(400);
	});
});

describe("GET /api/bindings (list)", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	test("returns empty array when no bindings", async () => {
		const ctx = makeCtx(db);
		const res = await bindingsListRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data).toEqual([]);
	});

	test("returns bindings with agent/asset info", async () => {
		await insertAgent(db, "agt_1", "my-agent");
		await insertAsset(db, "ast_1", "my-asset", "domain");
		await db
			.prepare("INSERT INTO agent_asset_bindings (agent_id, asset_id) VALUES (?, ?)")
			.bind("agt_1", "ast_1")
			.run();

		const ctx = makeCtx(db);
		const res = await bindingsListRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data).toHaveLength(1);
		expect(data[0].agent_id).toBe("agt_1");
		expect(data[0].agent_nickname).toBe("my-agent");
		expect(data[0].asset_id).toBe("ast_1");
		expect(data[0].asset_name).toBe("my-asset");
		expect(data[0].asset_type).toBe("domain");
	});
});

describe("DELETE /api/bindings/:agentId/:assetId", () => {
	let db: D1Database;

	beforeEach(async () => {
		db = createMockD1();
		await insertAgent(db, "agt_1");
		await insertAsset(db, "ast_1", "asset-1");
		await db
			.prepare("INSERT INTO agent_asset_bindings (agent_id, asset_id) VALUES (?, ?)")
			.bind("agt_1", "ast_1")
			.run();
	});

	test("deletes existing binding → 204", async () => {
		const ctx = makeCtx(db, { params: { agentId: "agt_1", assetId: "ast_1" } });
		const res = await bindingsDeleteRoute(ctx);
		expect(res.status).toBe(204);
	});

	test("returns 404 for non-existent binding", async () => {
		const ctx = makeCtx(db, { params: { agentId: "agt_1", assetId: "ast_ghost" } });
		const res = await bindingsDeleteRoute(ctx);
		expect(res.status).toBe(404);
	});

	test("returns 404 on double-delete", async () => {
		const ctx1 = makeCtx(db, { params: { agentId: "agt_1", assetId: "ast_1" } });
		await bindingsDeleteRoute(ctx1);
		const ctx2 = makeCtx(db, { params: { agentId: "agt_1", assetId: "ast_1" } });
		const res = await bindingsDeleteRoute(ctx2);
		expect(res.status).toBe(404);
	});
});

// --- Map & Overview ---

describe("GET /api/assets/map", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	test("returns empty graph when no data", async () => {
		const ctx = makeCtx(db);
		const res = await assetsMapRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.hosts).toEqual([]);
		expect(data.agents).toEqual([]);
		expect(data.assets).toEqual([]);
		expect(data.bindings).toEqual([]);
		expect(data.tags).toEqual([]);
	});

	test("returns full graph with all entity types", async () => {
		await insertHost(db, "h1", "web-1");
		await insertAgent(db, "agt_1", "my-agent");
		await insertAsset(db, "ast_1", "my-asset", "domain");
		await db
			.prepare("INSERT INTO agent_asset_bindings (agent_id, asset_id) VALUES (?, ?)")
			.bind("agt_1", "ast_1")
			.run();
		await insertTag(db, 1, "prod", 2);
		await db
			.prepare("INSERT INTO agent_tags (agent_id, tag_id) VALUES (?, ?)")
			.bind("agt_1", 1)
			.run();
		await db
			.prepare("INSERT INTO asset_tags (asset_id, tag_id) VALUES (?, ?)")
			.bind("ast_1", 1)
			.run();
		await db.prepare("INSERT INTO host_tags (host_id, tag_id) VALUES (?, ?)").bind("h1", 1).run();

		const ctx = makeCtx(db);
		const res = await assetsMapRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.hosts).toHaveLength(1);
		expect(data.hosts[0].hostname).toBe("web-1");
		expect(data.hosts[0].hid).toBe(hashHostId("h1"));
		expect(data.agents).toHaveLength(1);
		expect(data.agents[0].nickname).toBe("my-agent");
		expect(data.assets).toHaveLength(1);
		expect(data.assets[0].name).toBe("my-asset");
		expect(data.bindings).toHaveLength(1);
		expect(data.tags).toHaveLength(3); // agent + asset + host
	});
});

describe("GET /api/assets/overview", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	test("returns zeroes when no data", async () => {
		const ctx = makeCtx(db);
		const res = await assetsOverviewRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.agents.total).toBe(0);
		expect(data.assets.total).toBe(0);
		expect(data.bindings).toBe(0);
	});

	test("returns correct counts", async () => {
		await insertAgent(db, "agt_1");
		await insertAgent(db, "agt_2");
		await insertAsset(db, "ast_1", "a1", "domain");
		await insertAsset(db, "ast_2", "a2", "container");
		await insertAsset(db, "ast_3", "a3", "domain");
		await db
			.prepare("INSERT INTO agent_asset_bindings (agent_id, asset_id) VALUES (?, ?)")
			.bind("agt_1", "ast_1")
			.run();

		const ctx = makeCtx(db);
		const res = await assetsOverviewRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.agents.total).toBe(2);
		expect(data.agents.by_status.running).toBe(2);
		expect(data.assets.total).toBe(3);
		expect(data.assets.by_type.domain).toBe(2);
		expect(data.assets.by_type.container).toBe(1);
		expect(data.assets.by_status.active).toBe(3);
		expect(data.bindings).toBe(1);
	});
});
