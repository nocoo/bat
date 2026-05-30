// Tests for Asset CRUD routes
import { beforeEach, describe, expect, test } from "vitest";
import { createD1Repositories } from "../adapters/d1/factory.js";
import { createMockD1 } from "../test-helpers/mock-d1.js";
import {
	assetsCreateRoute,
	assetsDeleteRoute,
	assetsGetRoute,
	assetsListRoute,
	assetsTagsReplaceRoute,
	assetsUpdateRoute,
} from "./assets.js";

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

/** Link asset to tag. */
async function linkAssetTag(db: D1Database, assetId: string, tagId: number) {
	await db
		.prepare("INSERT INTO asset_tags (asset_id, tag_id) VALUES (?, ?)")
		.bind(assetId, tagId)
		.run();
}

/** Insert a minimal agent row for binding cascade tests. */
async function insertAgent(db: D1Database, agentId: string) {
	await db
		.prepare(
			"INSERT INTO agents (id, source_key, match_key, status, metadata) VALUES (?, 'sk', 'mk', 'unknown', '{}')",
		)
		.bind(agentId)
		.run();
}

/** Insert a binding row. */
async function insertBinding(db: D1Database, agentId: string, assetId: string) {
	await db
		.prepare("INSERT INTO agent_asset_bindings (agent_id, asset_id) VALUES (?, ?)")
		.bind(agentId, assetId)
		.run();
}

/** Count rows in assets table. */
async function countAssets(db: D1Database): Promise<number> {
	const row = await db
		.prepare("SELECT COUNT(*) as cnt FROM assets")
		.bind()
		.first<{ cnt: number }>();
	return row?.cnt ?? 0;
}

async function parseJson(res: Response) {
	return JSON.parse(await res.text());
}

// --- Tests ---

describe("POST /api/assets (create)", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	test("creates asset with required fields only", async () => {
		const ctx = makeCtx(db, {
			body: { type: "cloud_service", name: "My Worker" },
		});
		const res = await assetsCreateRoute(ctx);
		expect(res.status).toBe(201);
		const data = await parseJson(res);
		expect(data.id).toMatch(/^ast_/);
		expect(data.type).toBe("cloud_service");
		expect(data.name).toBe("My Worker");
		expect(data.subtype).toBeNull();
		expect(data.provider).toBeNull();
		expect(data.status).toBe("active");
		expect(data.metadata).toEqual({});
		expect(data.tags).toEqual([]);
		expect(await countAssets(db)).toBe(1);
	});

	test("creates asset with all optional fields", async () => {
		await insertHost(db, "host_001", "web-server");
		const ctx = makeCtx(db, {
			body: {
				type: "cloud_service",
				name: "My Pages Site",
				host_id: "host_001",
				subtype: "pages",
				provider: "cloudflare",
				status: "inactive",
				metadata: { domain: "example.com" },
			},
		});
		const res = await assetsCreateRoute(ctx);
		expect(res.status).toBe(201);
		const data = await parseJson(res);
		expect(data.type).toBe("cloud_service");
		expect(data.name).toBe("My Pages Site");
		expect(data.host_id).toBe("host_001");
		expect(data.hostname).toBe("web-server");
		expect(data.subtype).toBe("pages");
		expect(data.provider).toBe("cloudflare");
		expect(data.status).toBe("inactive");
		expect(data.metadata).toEqual({ domain: "example.com" });
	});

	test("returns 400 if type is missing", async () => {
		const ctx = makeCtx(db, { body: { name: "no-type" } });
		const res = await assetsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("type");
	});

	test("returns 400 if name is missing", async () => {
		const ctx = makeCtx(db, { body: { type: "domain" } });
		const res = await assetsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("name");
	});

	test("returns 400 for invalid type enum", async () => {
		const ctx = makeCtx(db, { body: { type: "bogus", name: "x" } });
		const res = await assetsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("type");
	});

	test("returns 400 for invalid status enum", async () => {
		const ctx = makeCtx(db, {
			body: { type: "domain", name: "x", status: "nope" },
		});
		const res = await assetsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("status");
	});

	test("returns 400 for name exceeding max length", async () => {
		const ctx = makeCtx(db, {
			body: { type: "domain", name: "x".repeat(129) },
		});
		const res = await assetsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("name");
	});

	test("returns 400 for subtype exceeding max length", async () => {
		const ctx = makeCtx(db, {
			body: { type: "domain", name: "ok", subtype: "x".repeat(65) },
		});
		const res = await assetsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("subtype");
	});

	test("returns 400 for provider exceeding max length", async () => {
		const ctx = makeCtx(db, {
			body: { type: "domain", name: "ok", provider: "x".repeat(65) },
		});
		const res = await assetsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("provider");
	});

	test("returns 400 for invalid host_id FK", async () => {
		const ctx = makeCtx(db, {
			body: { type: "domain", name: "ok", host_id: "nonexistent" },
		});
		const res = await assetsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("host_id");
	});

	test("returns 400 for empty body", async () => {
		const ctx = makeCtx(db, { rawBody: "" });
		const res = await assetsCreateRoute(ctx);
		expect(res.status).toBe(400);
	});

	test("returns 400 for non-JSON body", async () => {
		const ctx = makeCtx(db, { rawBody: "not json" });
		const res = await assetsCreateRoute(ctx);
		expect(res.status).toBe(400);
	});

	test("returns 400 for array body", async () => {
		const ctx = makeCtx(db, { rawBody: "[]" });
		const res = await assetsCreateRoute(ctx);
		expect(res.status).toBe(400);
	});

	test("returns 400 for metadata exceeding 4096 bytes", async () => {
		const ctx = makeCtx(db, {
			body: { type: "domain", name: "ok", metadata: { big: "x".repeat(4100) } },
		});
		const res = await assetsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("metadata");
	});

	test("returns 400 for non-object metadata", async () => {
		const ctx = makeCtx(db, {
			body: { type: "domain", name: "ok", metadata: [1, 2] },
		});
		const res = await assetsCreateRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("metadata");
	});
});

describe("GET /api/assets (list)", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	test("returns empty array when no assets", async () => {
		const ctx = makeCtx(db);
		const res = await assetsListRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data).toEqual([]);
	});

	test("returns created assets", async () => {
		// Create two assets
		const ctx1 = makeCtx(db, { body: { type: "domain", name: "first" } });
		await assetsCreateRoute(ctx1);
		const ctx2 = makeCtx(db, { body: { type: "container", name: "second" } });
		await assetsCreateRoute(ctx2);

		const ctx = makeCtx(db);
		const res = await assetsListRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data).toHaveLength(2);
	});
});

describe("GET /api/assets/:id", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	test("returns 404 for non-existent asset", async () => {
		const ctx = makeCtx(db, { params: { id: "ast_ghost" } });
		const res = await assetsGetRoute(ctx);
		expect(res.status).toBe(404);
	});

	test("returns asset with tags and hostname", async () => {
		await insertHost(db, "h1", "my-host");
		// Create asset
		const createCtx = makeCtx(db, {
			body: { type: "cli_tool", name: "docker", host_id: "h1" },
		});
		const createRes = await assetsCreateRoute(createCtx);
		const created = await parseJson(createRes);

		// Add tag
		await insertTag(db, 1, "infra", 2);
		await linkAssetTag(db, created.id, 1);

		const ctx = makeCtx(db, { params: { id: created.id } });
		const res = await assetsGetRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.id).toBe(created.id);
		expect(data.hostname).toBe("my-host");
		expect(data.tags).toHaveLength(1);
		expect(data.tags[0].name).toBe("infra");
	});
});

describe("PATCH /api/assets/:id (update)", () => {
	let db: D1Database;
	let assetId: string;

	beforeEach(async () => {
		db = createMockD1();
		const ctx = makeCtx(db, { body: { type: "domain", name: "original" } });
		const res = await assetsCreateRoute(ctx);
		const data = await parseJson(res);
		assetId = data.id;
	});

	test("updates name", async () => {
		const ctx = makeCtx(db, {
			params: { id: assetId },
			body: { name: "updated" },
		});
		const res = await assetsUpdateRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.name).toBe("updated");
		expect(data.updated_at).not.toBeNull();
	});

	test("updates subtype and provider", async () => {
		const ctx = makeCtx(db, {
			params: { id: assetId },
			body: { subtype: "workers", provider: "cloudflare" },
		});
		const res = await assetsUpdateRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.subtype).toBe("workers");
		expect(data.provider).toBe("cloudflare");
	});

	test("clears nullable field with null", async () => {
		// First set subtype
		const setCtx = makeCtx(db, {
			params: { id: assetId },
			body: { subtype: "pages" },
		});
		await assetsUpdateRoute(setCtx);

		// Then clear it
		const clearCtx = makeCtx(db, {
			params: { id: assetId },
			body: { subtype: null },
		});
		const res = await assetsUpdateRoute(clearCtx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.subtype).toBeNull();
	});

	test("clears provider with empty string → null", async () => {
		// Set provider
		const setCtx = makeCtx(db, {
			params: { id: assetId },
			body: { provider: "docker" },
		});
		await assetsUpdateRoute(setCtx);

		// Clear with empty string
		const clearCtx = makeCtx(db, {
			params: { id: assetId },
			body: { provider: "" },
		});
		const res = await assetsUpdateRoute(clearCtx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.provider).toBeNull();
	});

	test("returns 404 for non-existent asset", async () => {
		const ctx = makeCtx(db, {
			params: { id: "ast_nope" },
			body: { name: "x" },
		});
		const res = await assetsUpdateRoute(ctx);
		expect(res.status).toBe(404);
	});

	test("returns 400 for invalid status", async () => {
		const ctx = makeCtx(db, {
			params: { id: assetId },
			body: { status: "bogus" },
		});
		const res = await assetsUpdateRoute(ctx);
		expect(res.status).toBe(400);
	});

	test("returns 400 for invalid host_id FK", async () => {
		const ctx = makeCtx(db, {
			params: { id: assetId },
			body: { host_id: "nonexistent" },
		});
		const res = await assetsUpdateRoute(ctx);
		expect(res.status).toBe(400);
	});

	test("updates host_id when FK exists", async () => {
		await insertHost(db, "h1", "web-1");
		const ctx = makeCtx(db, {
			params: { id: assetId },
			body: { host_id: "h1" },
		});
		const res = await assetsUpdateRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.host_id).toBe("h1");
		expect(data.hostname).toBe("web-1");
	});

	test("clears host_id with null", async () => {
		await insertHost(db, "h1", "web-1");
		// Set host_id
		const setCtx = makeCtx(db, {
			params: { id: assetId },
			body: { host_id: "h1" },
		});
		await assetsUpdateRoute(setCtx);

		// Clear
		const clearCtx = makeCtx(db, {
			params: { id: assetId },
			body: { host_id: null },
		});
		const res = await assetsUpdateRoute(clearCtx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.host_id).toBeNull();
		expect(data.hostname).toBeNull();
	});

	test("returns 400 for empty body", async () => {
		const ctx = makeCtx(db, { params: { id: assetId }, rawBody: "" });
		const res = await assetsUpdateRoute(ctx);
		expect(res.status).toBe(400);
	});

	test("returns 400 for non-JSON body", async () => {
		const ctx = makeCtx(db, { params: { id: assetId }, rawBody: "nope" });
		const res = await assetsUpdateRoute(ctx);
		expect(res.status).toBe(400);
	});
});

describe("DELETE /api/assets/:id", () => {
	let db: D1Database;
	let assetId: string;

	beforeEach(async () => {
		db = createMockD1();
		const ctx = makeCtx(db, { body: { type: "domain", name: "to-delete" } });
		const res = await assetsCreateRoute(ctx);
		const data = await parseJson(res);
		assetId = data.id;
	});

	test("deletes existing asset → 204", async () => {
		const ctx = makeCtx(db, { params: { id: assetId } });
		const res = await assetsDeleteRoute(ctx);
		expect(res.status).toBe(204);
		expect(await countAssets(db)).toBe(0);
	});

	test("returns 404 for non-existent asset", async () => {
		const ctx = makeCtx(db, { params: { id: "ast_ghost" } });
		const res = await assetsDeleteRoute(ctx);
		expect(res.status).toBe(404);
	});

	test("returns 404 on double-delete", async () => {
		const ctx1 = makeCtx(db, { params: { id: assetId } });
		await assetsDeleteRoute(ctx1);
		const ctx2 = makeCtx(db, { params: { id: assetId } });
		const res = await assetsDeleteRoute(ctx2);
		expect(res.status).toBe(404);
	});

	test("cascade removes tags on delete", async () => {
		await insertTag(db, 1, "infra");
		await linkAssetTag(db, assetId, 1);

		// Verify tag link exists
		const before = await db
			.prepare("SELECT COUNT(*) as cnt FROM asset_tags WHERE asset_id = ?")
			.bind(assetId)
			.first<{ cnt: number }>();
		expect(before?.cnt).toBe(1);

		// Delete asset
		const ctx = makeCtx(db, { params: { id: assetId } });
		await assetsDeleteRoute(ctx);

		// Tag link should be gone (CASCADE)
		const after = await db
			.prepare("SELECT COUNT(*) as cnt FROM asset_tags WHERE asset_id = ?")
			.bind(assetId)
			.first<{ cnt: number }>();
		expect(after?.cnt).toBe(0);
	});

	test("cascade removes bindings on delete", async () => {
		await insertAgent(db, "agt_test");
		await insertBinding(db, "agt_test", assetId);

		// Verify binding exists
		const before = await db
			.prepare("SELECT COUNT(*) as cnt FROM agent_asset_bindings WHERE asset_id = ?")
			.bind(assetId)
			.first<{ cnt: number }>();
		expect(before?.cnt).toBe(1);

		// Delete asset
		const ctx = makeCtx(db, { params: { id: assetId } });
		await assetsDeleteRoute(ctx);

		// Binding should be gone (CASCADE)
		const after = await db
			.prepare("SELECT COUNT(*) as cnt FROM agent_asset_bindings WHERE asset_id = ?")
			.bind(assetId)
			.first<{ cnt: number }>();
		expect(after?.cnt).toBe(0);
	});
});

describe("PUT /api/assets/:id/tags", () => {
	let db: D1Database;
	let assetId: string;

	beforeEach(async () => {
		db = createMockD1();
		const ctx = makeCtx(db, { body: { type: "domain", name: "tagged" } });
		const res = await assetsCreateRoute(ctx);
		const data = await parseJson(res);
		assetId = data.id;
	});

	test("assigns tags", async () => {
		await insertTag(db, 1, "infra", 1);
		await insertTag(db, 2, "prod", 3);

		const ctx = makeCtx(db, {
			params: { id: assetId },
			body: { tag_ids: [1, 2] },
		});
		const res = await assetsTagsReplaceRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.tags).toHaveLength(2);
		const names = data.tags.map((t: { name: string }) => t.name).sort();
		expect(names).toEqual(["infra", "prod"]);
	});

	test("clears all tags with empty array", async () => {
		await insertTag(db, 1, "infra");
		await linkAssetTag(db, assetId, 1);

		const ctx = makeCtx(db, {
			params: { id: assetId },
			body: { tag_ids: [] },
		});
		const res = await assetsTagsReplaceRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.tags).toEqual([]);
	});

	test("returns 400 for non-existent tag_ids", async () => {
		const ctx = makeCtx(db, {
			params: { id: assetId },
			body: { tag_ids: [99999] },
		});
		const res = await assetsTagsReplaceRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("tag_ids");
	});

	test("returns 404 for non-existent asset", async () => {
		const ctx = makeCtx(db, {
			params: { id: "ast_ghost" },
			body: { tag_ids: [] },
		});
		const res = await assetsTagsReplaceRoute(ctx);
		expect(res.status).toBe(404);
	});

	test("returns 400 if tag_ids is not array", async () => {
		const ctx = makeCtx(db, {
			params: { id: assetId },
			body: { tag_ids: "not-array" },
		});
		const res = await assetsTagsReplaceRoute(ctx);
		expect(res.status).toBe(400);
	});

	test("returns 400 if tag_ids contains non-integer", async () => {
		const ctx = makeCtx(db, {
			params: { id: assetId },
			body: { tag_ids: [1.5] },
		});
		const res = await assetsTagsReplaceRoute(ctx);
		expect(res.status).toBe(400);
	});

	test("deduplicates tag_ids before max check", async () => {
		// Create 10 tags (max)
		for (let i = 1; i <= 10; i++) {
			await insertTag(db, i, `tag-${i}`);
		}
		// Send 11 entries but with duplicates → unique count = 10 → OK
		const ctx = makeCtx(db, {
			params: { id: assetId },
			body: { tag_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10] },
		});
		const res = await assetsTagsReplaceRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.tags).toHaveLength(10);
	});

	test("returns 400 if unique tag_ids exceed max", async () => {
		// 11 unique tag IDs → exceeds MAX_TAGS_PER_ASSET (10)
		const ctx = makeCtx(db, {
			params: { id: assetId },
			body: { tag_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
		});
		const res = await assetsTagsReplaceRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("maximum");
	});

	test("replaces existing tags atomically", async () => {
		await insertTag(db, 1, "old-tag");
		await insertTag(db, 2, "new-tag");
		await linkAssetTag(db, assetId, 1);

		// Replace tag 1 with tag 2
		const ctx = makeCtx(db, {
			params: { id: assetId },
			body: { tag_ids: [2] },
		});
		const res = await assetsTagsReplaceRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.tags).toHaveLength(1);
		expect(data.tags[0].name).toBe("new-tag");
	});
});
