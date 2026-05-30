// Tests for Agent CRUD routes
import { beforeEach, describe, expect, test } from "vitest";
import { createD1Repositories } from "../adapters/d1/factory.js";
import { createMockD1 } from "../test-helpers/mock-d1.js";
import {
	agentsCreateRoute,
	agentsDeleteRoute,
	agentsGetRoute,
	agentsListRoute,
	agentsTagsReplaceRoute,
	agentsUpdateRoute,
} from "./agents.js";

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
		var: { repos: createD1Repositories(db) },
		req: {
			param: (key: string) => opts.params?.[key],
			text: async () => rawText,
			json: async () => {
				if (opts.body === undefined) {
					throw new Error("No body");
				}
				return opts.body;
			},
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

/** Insert a host row directly for FK tests. */
async function insertHost(db: D1Database, hostId: string, hostname = "test-host") {
	await db
		.prepare(
			"INSERT INTO hosts (host_id, hostname, last_seen, is_active, created_at) VALUES (?, ?, unixepoch(), 1, unixepoch())",
		)
		.bind(hostId, hostname)
		.run();
}

/** Insert a tag row directly. */
async function insertTag(db: D1Database, id: number, name: string, color = 0) {
	await db
		.prepare("INSERT INTO tags (id, name, color) VALUES (?, ?, ?)")
		.bind(id, name, color)
		.run();
}

/** Link agent to tag. */
async function linkAgentTag(db: D1Database, agentId: string, tagId: number) {
	await db
		.prepare("INSERT INTO agent_tags (agent_id, tag_id) VALUES (?, ?)")
		.bind(agentId, tagId)
		.run();
}

/** Insert a minimal asset row for binding cascade tests. */
async function insertAsset(db: D1Database, assetId: string) {
	await db
		.prepare(
			"INSERT INTO assets (id, type, name, status, metadata) VALUES (?, 'cli_tool', 'test', 'active', '{}')",
		)
		.bind(assetId)
		.run();
}

/** Insert a binding row. */
async function insertBinding(db: D1Database, agentId: string, assetId: string) {
	await db
		.prepare("INSERT INTO agent_asset_bindings (agent_id, asset_id) VALUES (?, ?)")
		.bind(agentId, assetId)
		.run();
}

/** Count rows in agents table. */
async function countAgents(db: D1Database): Promise<number> {
	const row = await db
		.prepare("SELECT COUNT(*) as cnt FROM agents")
		.bind()
		.first<{ cnt: number }>();
	return row?.cnt ?? 0;
}

async function parseJson(res: Response) {
	return JSON.parse(await res.text());
}

// --- Tests ---

describe("POST /api/agents (create)", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	test("creates agent with required fields only", async () => {
		const ctx = makeCtx(db, {
			body: { source_key: "src_abc123", match_key: "match_xyz" },
		});
		const res = await agentsCreateRoute(ctx);
		expect(res.status).toBe(201);
		const data = await parseJson(res);
		expect(data.id).toMatch(/^agt_/);
		expect(data.source_key_short).toBe("src_abc1");
		expect(data.match_key).toBe("match_xyz");
		expect(data.status).toBe("unknown");
		expect(data.nickname).toBeNull();
		expect(data.role).toBeNull();
		expect(data.metadata).toEqual({});
		expect(data.tags).toEqual([]);
		expect(await countAgents(db)).toBe(1);
	});

	test("creates agent with all optional fields", async () => {
		await insertHost(db, "host_001", "web-server");
		const ctx = makeCtx(db, {
			body: {
				source_key: "src_k",
				match_key: "match_k",
				host_id: "host_001",
				nickname: "my-agent",
				role: "worker",
				runtime_app: "claude-code",
				runtime_version: "1.2.3",
				status: "running",
				metadata: { env: "prod" },
			},
		});
		const res = await agentsCreateRoute(ctx);
		expect(res.status).toBe(201);
		const data = await parseJson(res);
		expect(data.host_id).toBe("host_001");
		expect(data.hostname).toBe("web-server");
		expect(data.nickname).toBe("my-agent");
		expect(data.role).toBe("worker");
		expect(data.runtime_app).toBe("claude-code");
		expect(data.runtime_version).toBe("1.2.3");
		expect(data.status).toBe("running");
		expect(data.metadata).toEqual({ env: "prod" });
	});

	test("upserts on duplicate source_key + match_key", async () => {
		const ctx1 = makeCtx(db, {
			body: { source_key: "src_dup", match_key: "match_dup", nickname: "first" },
		});
		const res1 = await agentsCreateRoute(ctx1);
		expect(res1.status).toBe(201);
		const data1 = await parseJson(res1);

		const ctx2 = makeCtx(db, {
			body: {
				source_key: "src_dup",
				match_key: "match_dup",
				nickname: "second",
				status: "running",
			},
		});
		const res2 = await agentsCreateRoute(ctx2);
		expect(res2.status).toBe(200);
		const data2 = await parseJson(res2);
		expect(data2.id).toBe(data1.id);
		expect(data2.nickname).toBe("second");
		expect(data2.status).toBe("running");
		expect(await countAgents(db)).toBe(1);
	});

	test("upsert via service handles duplicate gracefully", async () => {
		const ctx1 = makeCtx(db, {
			body: { source_key: "race_src", match_key: "race_mk", nickname: "first" },
		});
		const res1 = await agentsCreateRoute(ctx1);
		expect(res1.status).toBe(201);
		const data1 = await parseJson(res1);

		// Second POST with same keys goes through upsertAgent service
		const ctx2 = makeCtx(db, {
			body: { source_key: "race_src", match_key: "race_mk", nickname: "raced" },
		});
		const res2 = await agentsCreateRoute(ctx2);
		expect(res2.status).toBe(200);
		const data2 = await parseJson(res2);
		expect(data2.id).toBe(data1.id);
		expect(data2.nickname).toBe("raced");
		expect(await countAgents(db)).toBe(1);
	});

	test("rejects empty body", async () => {
		const ctx = makeCtx(db, { rawBody: "" });
		const res = await agentsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("body required");
	});

	test("rejects invalid JSON", async () => {
		const ctx = makeCtx(db, { rawBody: "{bad" });
		const res = await agentsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("Invalid JSON");
	});

	test("rejects non-object body (array)", async () => {
		const ctx = makeCtx(db, { rawBody: "[1,2,3]" });
		const res = await agentsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("JSON object");
		expect(await countAgents(db)).toBe(0);
	});

	test("rejects non-object body (null)", async () => {
		const ctx = makeCtx(db, { rawBody: "null" });
		const res = await agentsCreateRoute(ctx);
		expect(res.status).toBe(400);
		expect(await countAgents(db)).toBe(0);
	});

	test("rejects non-object body (string)", async () => {
		const ctx = makeCtx(db, { rawBody: '"hello"' });
		const res = await agentsCreateRoute(ctx);
		expect(res.status).toBe(400);
		expect(await countAgents(db)).toBe(0);
	});

	test("rejects missing source_key", async () => {
		const ctx = makeCtx(db, { body: { match_key: "mk" } });
		const res = await agentsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("source_key");
	});

	test("rejects missing match_key", async () => {
		const ctx = makeCtx(db, { body: { source_key: "sk" } });
		const res = await agentsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("match_key");
	});

	test("rejects source_key exceeding max length", async () => {
		const ctx = makeCtx(db, {
			body: { source_key: "x".repeat(129), match_key: "mk" },
		});
		const res = await agentsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("source_key");
	});

	test("rejects invalid status enum", async () => {
		const ctx = makeCtx(db, {
			body: { source_key: "sk", match_key: "mk", status: "invalid_status" },
		});
		const res = await agentsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("status");
	});

	test("rejects host_id FK that does not exist", async () => {
		const ctx = makeCtx(db, {
			body: { source_key: "sk", match_key: "mk", host_id: "nonexistent" },
		});
		const res = await agentsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("host_id");
		expect(data.error).toContain("does not exist");
		expect(await countAgents(db)).toBe(0);
	});

	test("rejects empty-string host_id", async () => {
		const ctx = makeCtx(db, {
			body: { source_key: "sk", match_key: "mk", host_id: "" },
		});
		const res = await agentsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("host_id");
	});

	test("accepts null host_id", async () => {
		const ctx = makeCtx(db, {
			body: { source_key: "sk", match_key: "mk", host_id: null },
		});
		const res = await agentsCreateRoute(ctx);
		expect(res.status).toBe(201);
		const data = await parseJson(res);
		expect(data.host_id).toBeNull();
	});

	test("rejects metadata exceeding size limit", async () => {
		const bigMeta: Record<string, string> = {};
		for (let i = 0; i < 200; i++) {
			bigMeta[`key_${i}`] = "x".repeat(100);
		}
		const ctx = makeCtx(db, {
			body: { source_key: "sk", match_key: "mk", metadata: bigMeta },
		});
		const res = await agentsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("metadata");
	});

	test("rejects non-object metadata", async () => {
		const ctx = makeCtx(db, {
			body: { source_key: "sk", match_key: "mk", metadata: "not-an-object" },
		});
		const res = await agentsCreateRoute(ctx);
		expect(res.status).toBe(400);
	});
});

describe("GET /api/agents (list)", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	test("returns empty array when no agents", async () => {
		const ctx = makeCtx(db);
		const res = await agentsListRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data).toEqual([]);
	});

	test("returns all agents with hostname and tags", async () => {
		await insertHost(db, "host_a", "alpha-host");
		await insertTag(db, 1, "prod", 0xff0000);

		// Create agent
		const ctx1 = makeCtx(db, {
			body: { source_key: "sk1", match_key: "mk1", host_id: "host_a", nickname: "agent-1" },
		});
		const createRes = await agentsCreateRoute(ctx1);
		const created = await parseJson(createRes);

		// Link tag
		await linkAgentTag(db, created.id, 1);

		// List
		const ctx2 = makeCtx(db);
		const res = await agentsListRoute(ctx2);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data).toHaveLength(1);
		expect(data[0].hostname).toBe("alpha-host");
		expect(data[0].tags).toHaveLength(1);
		expect(data[0].tags[0].name).toBe("prod");
		expect(data[0].tags[0].color).toBe(0xff0000);
	});
});

describe("GET /api/agents/:id", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	test("returns agent by id", async () => {
		const ctx1 = makeCtx(db, {
			body: { source_key: "sk", match_key: "mk", nickname: "found-me" },
		});
		const createRes = await agentsCreateRoute(ctx1);
		const created = await parseJson(createRes);

		const ctx2 = makeCtx(db, { params: { id: created.id } });
		const res = await agentsGetRoute(ctx2);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.id).toBe(created.id);
		expect(data.nickname).toBe("found-me");
	});

	test("returns 404 for non-existent id", async () => {
		const ctx = makeCtx(db, { params: { id: "agt_nonexistent" } });
		const res = await agentsGetRoute(ctx);
		expect(res.status).toBe(404);
	});
});

describe("PATCH /api/agents/:id (update)", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	async function createTestAgent(overrides: Record<string, unknown> = {}) {
		const ctx = makeCtx(db, {
			body: { source_key: "sk", match_key: "mk", ...overrides },
		});
		const res = await agentsCreateRoute(ctx);
		return parseJson(res);
	}

	test("updates nickname", async () => {
		const created = await createTestAgent({ nickname: "old" });
		const ctx = makeCtx(db, {
			params: { id: created.id },
			body: { nickname: "new" },
		});
		const res = await agentsUpdateRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.nickname).toBe("new");
	});

	test("updates status", async () => {
		const created = await createTestAgent();
		const ctx = makeCtx(db, {
			params: { id: created.id },
			body: { status: "running" },
		});
		const res = await agentsUpdateRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.status).toBe("running");
	});

	test("updates host_id with valid FK", async () => {
		await insertHost(db, "host_new", "new-host");
		const created = await createTestAgent();
		const ctx = makeCtx(db, {
			params: { id: created.id },
			body: { host_id: "host_new" },
		});
		const res = await agentsUpdateRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.host_id).toBe("host_new");
		expect(data.hostname).toBe("new-host");
	});

	test("clears host_id with null", async () => {
		await insertHost(db, "host_x", "x-host");
		const created = await createTestAgent({ host_id: "host_x" });
		expect(created.host_id).toBe("host_x");

		const ctx = makeCtx(db, {
			params: { id: created.id },
			body: { host_id: null },
		});
		const res = await agentsUpdateRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.host_id).toBeNull();
	});

	test("updates metadata", async () => {
		const created = await createTestAgent();
		const ctx = makeCtx(db, {
			params: { id: created.id },
			body: { metadata: { version: "2.0" } },
		});
		const res = await agentsUpdateRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.metadata).toEqual({ version: "2.0" });
	});

	test("returns 404 for non-existent agent", async () => {
		const ctx = makeCtx(db, {
			params: { id: "agt_ghost" },
			body: { nickname: "nope" },
		});
		const res = await agentsUpdateRoute(ctx);
		expect(res.status).toBe(404);
	});

	test("rejects invalid status", async () => {
		const created = await createTestAgent();
		const ctx = makeCtx(db, {
			params: { id: created.id },
			body: { status: "bogus" },
		});
		const res = await agentsUpdateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("status");
	});

	test("rejects host_id FK that does not exist", async () => {
		const created = await createTestAgent();
		const ctx = makeCtx(db, {
			params: { id: created.id },
			body: { host_id: "nonexistent" },
		});
		const res = await agentsUpdateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("host_id");
	});

	test("rejects empty body", async () => {
		const created = await createTestAgent();
		const ctx = makeCtx(db, {
			params: { id: created.id },
			rawBody: "",
		});
		const res = await agentsUpdateRoute(ctx);
		expect(res.status).toBe(400);
	});

	test("rejects invalid JSON body", async () => {
		const created = await createTestAgent();
		const ctx = makeCtx(db, {
			params: { id: created.id },
			rawBody: "not-json",
		});
		const res = await agentsUpdateRoute(ctx);
		expect(res.status).toBe(400);
	});

	test("rejects non-object body", async () => {
		const created = await createTestAgent();
		const ctx = makeCtx(db, {
			params: { id: created.id },
			rawBody: "[1,2]",
		});
		const res = await agentsUpdateRoute(ctx);
		expect(res.status).toBe(400);
	});
});

describe("DELETE /api/agents/:id", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	test("deletes existing agent (hard delete)", async () => {
		const ctx1 = makeCtx(db, {
			body: { source_key: "sk_del", match_key: "mk_del" },
		});
		const createRes = await agentsCreateRoute(ctx1);
		const created = await parseJson(createRes);
		expect(await countAgents(db)).toBe(1);

		const ctx2 = makeCtx(db, { params: { id: created.id } });
		const res = await agentsDeleteRoute(ctx2);
		expect(res.status).toBe(204);
		expect(await countAgents(db)).toBe(0);
	});

	test("returns 404 for non-existent agent", async () => {
		const ctx = makeCtx(db, { params: { id: "agt_nope" } });
		const res = await agentsDeleteRoute(ctx);
		expect(res.status).toBe(404);
	});

	test("cascades tag associations on delete", async () => {
		await insertTag(db, 10, "temp-tag");
		const ctx1 = makeCtx(db, {
			body: { source_key: "sk_cas", match_key: "mk_cas" },
		});
		const createRes = await agentsCreateRoute(ctx1);
		const created = await parseJson(createRes);
		await linkAgentTag(db, created.id, 10);

		// Verify tag link exists
		const tagRow = await db
			.prepare("SELECT COUNT(*) as cnt FROM agent_tags WHERE agent_id = ?")
			.bind(created.id)
			.first<{ cnt: number }>();
		expect(tagRow?.cnt).toBe(1);

		// Delete agent
		const ctx2 = makeCtx(db, { params: { id: created.id } });
		await agentsDeleteRoute(ctx2);

		// Tag association should be cascade-deleted
		const tagRowAfter = await db
			.prepare("SELECT COUNT(*) as cnt FROM agent_tags WHERE agent_id = ?")
			.bind(created.id)
			.first<{ cnt: number }>();
		expect(tagRowAfter?.cnt).toBe(0);
	});

	test("cascades agent_asset_bindings on delete", async () => {
		const ctx1 = makeCtx(db, {
			body: { source_key: "sk_bind", match_key: "mk_bind" },
		});
		const createRes = await agentsCreateRoute(ctx1);
		const created = await parseJson(createRes);

		// Insert asset + binding
		await insertAsset(db, "ast_test_001");
		await insertBinding(db, created.id, "ast_test_001");

		// Verify binding exists
		const bindRow = await db
			.prepare("SELECT COUNT(*) as cnt FROM agent_asset_bindings WHERE agent_id = ?")
			.bind(created.id)
			.first<{ cnt: number }>();
		expect(bindRow?.cnt).toBe(1);

		// Delete agent
		const ctx2 = makeCtx(db, { params: { id: created.id } });
		await agentsDeleteRoute(ctx2);

		// Binding should be cascade-deleted
		const bindRowAfter = await db
			.prepare("SELECT COUNT(*) as cnt FROM agent_asset_bindings WHERE agent_id = ?")
			.bind(created.id)
			.first<{ cnt: number }>();
		expect(bindRowAfter?.cnt).toBe(0);
	});
});

describe("PATCH /api/agents/:id — nullable field clearing", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	async function createAgentWithFields() {
		const ctx = makeCtx(db, {
			body: {
				source_key: "sk_clear",
				match_key: "mk_clear",
				nickname: "has-nick",
				role: "has-role",
				runtime_app: "has-app",
				runtime_version: "1.0",
			},
		});
		const res = await agentsCreateRoute(ctx);
		return parseJson(res);
	}

	test("PATCH { nickname: null } clears nickname to null", async () => {
		const created = await createAgentWithFields();
		expect(created.nickname).toBe("has-nick");

		const ctx = makeCtx(db, {
			params: { id: created.id },
			body: { nickname: null },
		});
		const res = await agentsUpdateRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.nickname).toBeNull();
	});

	test("PATCH { role: '' } clears role to null", async () => {
		const created = await createAgentWithFields();
		expect(created.role).toBe("has-role");

		const ctx = makeCtx(db, {
			params: { id: created.id },
			body: { role: "" },
		});
		const res = await agentsUpdateRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.role).toBeNull();
	});

	test("PATCH { runtime_app: null } clears runtime_app", async () => {
		const created = await createAgentWithFields();
		const ctx = makeCtx(db, {
			params: { id: created.id },
			body: { runtime_app: null },
		});
		const res = await agentsUpdateRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.runtime_app).toBeNull();
	});

	test("upsert with { nickname: null } clears nickname on existing", async () => {
		const created = await createAgentWithFields();
		expect(created.nickname).toBe("has-nick");

		const ctx = makeCtx(db, {
			body: { source_key: "sk_clear", match_key: "mk_clear", nickname: null },
		});
		const res = await agentsCreateRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.id).toBe(created.id);
		expect(data.nickname).toBeNull();
	});
});

describe("PUT /api/agents/:id/tags", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	async function createTestAgent() {
		const ctx = makeCtx(db, {
			body: { source_key: "sk_tags", match_key: "mk_tags" },
		});
		const res = await agentsCreateRoute(ctx);
		return parseJson(res);
	}

	test("replaces tags with valid tag_ids", async () => {
		await insertTag(db, 1, "work");
		await insertTag(db, 2, "learning");
		const agent = await createTestAgent();

		const ctx = makeCtx(db, {
			params: { id: agent.id },
			body: { tag_ids: [1, 2] },
		});
		const res = await agentsTagsReplaceRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.tags).toHaveLength(2);
		const tagNames = data.tags.map((t: { name: string }) => t.name).sort();
		expect(tagNames).toEqual(["learning", "work"]);
	});

	test("clears all tags with empty array", async () => {
		await insertTag(db, 1, "temp");
		const agent = await createTestAgent();
		await linkAgentTag(db, agent.id, 1);

		const ctx = makeCtx(db, {
			params: { id: agent.id },
			body: { tag_ids: [] },
		});
		const res = await agentsTagsReplaceRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.tags).toEqual([]);
	});

	test("replaces existing tags", async () => {
		await insertTag(db, 1, "old-tag");
		await insertTag(db, 2, "new-tag");
		const agent = await createTestAgent();
		await linkAgentTag(db, agent.id, 1);

		const ctx = makeCtx(db, {
			params: { id: agent.id },
			body: { tag_ids: [2] },
		});
		const res = await agentsTagsReplaceRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.tags).toHaveLength(1);
		expect(data.tags[0].name).toBe("new-tag");
	});

	test("returns 400 for non-existent tag_ids", async () => {
		const agent = await createTestAgent();
		const ctx = makeCtx(db, {
			params: { id: agent.id },
			body: { tag_ids: [999] },
		});
		const res = await agentsTagsReplaceRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("not found");
	});

	test("returns 400 when exceeding MAX_TAGS_PER_AGENT", async () => {
		const agent = await createTestAgent();
		// Create 11 tags (max is 10)
		for (let i = 1; i <= 11; i++) {
			await insertTag(db, i, `tag-${i}`);
		}
		const ctx = makeCtx(db, {
			params: { id: agent.id },
			body: { tag_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
		});
		const res = await agentsTagsReplaceRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("maximum");
	});

	test("returns 400 for missing tag_ids field", async () => {
		const agent = await createTestAgent();
		const ctx = makeCtx(db, {
			params: { id: agent.id },
			body: { tags: [1] },
		});
		const res = await agentsTagsReplaceRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("tag_ids");
	});

	test("returns 400 for non-integer tag_ids", async () => {
		const agent = await createTestAgent();
		const ctx = makeCtx(db, {
			params: { id: agent.id },
			body: { tag_ids: ["abc"] },
		});
		const res = await agentsTagsReplaceRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("positive integers");
	});

	test("returns 404 for non-existent agent", async () => {
		const ctx = makeCtx(db, {
			params: { id: "agt_ghost" },
			body: { tag_ids: [] },
		});
		const res = await agentsTagsReplaceRoute(ctx);
		expect(res.status).toBe(404);
	});

	test("deduplicates tag_ids", async () => {
		await insertTag(db, 1, "dup-tag");
		const agent = await createTestAgent();

		const ctx = makeCtx(db, {
			params: { id: agent.id },
			body: { tag_ids: [1, 1, 1] },
		});
		const res = await agentsTagsReplaceRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.tags).toHaveLength(1);
	});

	test("max check applies after dedup (12 dupes of 1 id passes)", async () => {
		await insertTag(db, 1, "only-tag");
		const agent = await createTestAgent();

		// 12 elements raw but only 1 unique — should pass max=10
		const ctx = makeCtx(db, {
			params: { id: agent.id },
			body: { tag_ids: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
		});
		const res = await agentsTagsReplaceRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.tags).toHaveLength(1);
	});
});
