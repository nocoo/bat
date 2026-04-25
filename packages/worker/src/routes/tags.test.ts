// Tests for tags route handlers
import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../test-helpers/mock-d1.js";
import {
	hostTagsAddRoute,
	hostTagsListRoute,
	hostTagsRemoveRoute,
	hostTagsReplaceRoute,
	parseTagId,
	tagsByHostsRoute,
	tagsCreateRoute,
	tagsDeleteRoute,
	tagsListRoute,
	tagsUpdateRoute,
	validateHostTagAddBody,
	validateHostTagReplaceBody,
	validateTagCreateBody,
	validateTagUpdateBody,
} from "./tags.js";

function makeCtx(
	db: D1Database,
	opts: {
		params?: Record<string, string>;
		body?: unknown;
		bodyRaw?: string;
	} = {},
) {
	const _hasBody = opts.body !== undefined || opts.bodyRaw !== undefined;
	return {
		env: { DB: db },
		req: {
			param: (key: string) => opts.params?.[key] ?? "",
			json: async () => {
				if (opts.bodyRaw !== undefined) {
					return JSON.parse(opts.bodyRaw);
				}
				if (opts.body === undefined) {
					throw new Error("No body");
				}
				return opts.body;
			},
			method: "POST",
		},
		json: (data: unknown, status?: number) =>
			new Response(JSON.stringify(data), {
				status: status ?? 200,
				headers: { "Content-Type": "application/json" },
			}),
		body: (_data: unknown, status?: number) => new Response(null, { status: status ?? 200 }),
		// biome-ignore lint/suspicious/noExplicitAny: test helper context
	} as any;
}

describe("tag validation helpers", () => {
	test("validateTagCreateBody rejects non-object", () => {
		expect(validateTagCreateBody(null).ok).toBe(false);
		expect(validateTagCreateBody("x").ok).toBe(false);
	});
	test("validateTagCreateBody rejects empty/too-long name", () => {
		expect(validateTagCreateBody({ name: "" }).ok).toBe(false);
		expect(validateTagCreateBody({ name: "x".repeat(1000) }).ok).toBe(false);
	});
	test("validateTagCreateBody accepts valid name, clamps color to null when invalid", () => {
		const r = validateTagCreateBody({ name: "prod", color: "bad" });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.color).toBe(null);
		}
	});
	test("validateTagCreateBody keeps valid color", () => {
		const r = validateTagCreateBody({ name: "prod", color: 2 });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.color).toBe(2);
		}
	});

	test("validateTagUpdateBody rejects non-object", () => {
		expect(validateTagUpdateBody(null).ok).toBe(false);
	});
	test("validateTagUpdateBody rejects bad name", () => {
		expect(validateTagUpdateBody({ name: "" }).ok).toBe(false);
	});
	test("validateTagUpdateBody rejects bad color", () => {
		expect(validateTagUpdateBody({ color: -1 }).ok).toBe(false);
		expect(validateTagUpdateBody({ color: 9999 }).ok).toBe(false);
		expect(validateTagUpdateBody({ color: "x" }).ok).toBe(false);
	});
	test("validateTagUpdateBody accepts partial updates", () => {
		expect(validateTagUpdateBody({ name: "new" }).ok).toBe(true);
		expect(validateTagUpdateBody({ color: 1 }).ok).toBe(true);
	});

	test("parseTagId", () => {
		expect(parseTagId(undefined)).toBe(null);
		expect(parseTagId("")).toBe(null);
		expect(parseTagId("abc")).toBe(null);
		expect(parseTagId("42")).toBe(42);
	});

	test("validateHostTagAddBody", () => {
		expect(validateHostTagAddBody(null).ok).toBe(false);
		expect(validateHostTagAddBody({}).ok).toBe(false);
		expect(validateHostTagAddBody({ tag_id: "x" }).ok).toBe(false);
		expect(validateHostTagAddBody({ tag_id: 5 }).ok).toBe(true);
	});

	test("validateHostTagReplaceBody", () => {
		expect(validateHostTagReplaceBody(null).ok).toBe(false);
		expect(validateHostTagReplaceBody({}).ok).toBe(false);
		expect(validateHostTagReplaceBody({ tag_ids: "x" }).ok).toBe(false);
		const tooMany = Array.from({ length: 100 }, (_, i) => i);
		expect(validateHostTagReplaceBody({ tag_ids: tooMany }).ok).toBe(false);
		expect(validateHostTagReplaceBody({ tag_ids: [1, 2] }).ok).toBe(true);
	});
});

describe("tag CRUD routes", () => {
	let db: D1Database;
	const HOST_ID = "h1";

	beforeEach(async () => {
		db = createMockD1();
		await db
			.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, 1)")
			.bind(HOST_ID, "h1.local", Math.floor(Date.now() / 1000))
			.run();
	});

	test("list tags returns empty initially", async () => {
		const res = await tagsListRoute(makeCtx(db));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([]);
	});

	test("create tag with auto color", async () => {
		const res = await tagsCreateRoute(makeCtx(db, { body: { name: "prod" } }));
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			id: number;
			name: string;
			color: number;
			host_count: number;
		};
		expect(body.name).toBe("prod");
		expect(body.host_count).toBe(0);
	});

	test("create tag with explicit color", async () => {
		const res = await tagsCreateRoute(makeCtx(db, { body: { name: "prod", color: 3 } }));
		expect(res.status).toBe(201);
		const body = (await res.json()) as { color: number };
		expect(body.color).toBe(3);
	});

	test("create tag rejects invalid JSON body", async () => {
		const ctx = {
			env: { DB: db },
			req: {
				json: async () => {
					throw new Error("bad");
				},
				param: () => "",
			},
			json: (d: unknown, s?: number) => new Response(JSON.stringify(d), { status: s ?? 200 }),
			// biome-ignore lint/suspicious/noExplicitAny: test
		} as any;
		const res = await tagsCreateRoute(ctx);
		expect(res.status).toBe(400);
	});

	test("create tag rejects invalid body", async () => {
		const res = await tagsCreateRoute(makeCtx(db, { body: {} }));
		expect(res.status).toBe(400);
	});

	test("create tag rejects duplicate name", async () => {
		await tagsCreateRoute(makeCtx(db, { body: { name: "prod" } }));
		const res = await tagsCreateRoute(makeCtx(db, { body: { name: "prod" } }));
		expect(res.status).toBe(409);
	});

	test("update tag: rename", async () => {
		const create = await tagsCreateRoute(makeCtx(db, { body: { name: "prod" } }));
		const { id } = (await create.json()) as { id: number };
		const res = await tagsUpdateRoute(
			makeCtx(db, { params: { id: String(id) }, body: { name: "production" } }),
		);
		expect(res.status).toBe(200);
		expect(((await res.json()) as { name: string }).name).toBe("production");
	});

	test("update tag: change color", async () => {
		const create = await tagsCreateRoute(makeCtx(db, { body: { name: "prod" } }));
		const { id } = (await create.json()) as { id: number };
		const res = await tagsUpdateRoute(
			makeCtx(db, { params: { id: String(id) }, body: { color: 5 } }),
		);
		expect(res.status).toBe(200);
		expect(((await res.json()) as { color: number }).color).toBe(5);
	});

	test("update tag: invalid ID", async () => {
		const res = await tagsUpdateRoute(makeCtx(db, { params: { id: "abc" }, body: { name: "x" } }));
		expect(res.status).toBe(400);
	});

	test("update tag: bad JSON", async () => {
		const ctx = {
			env: { DB: db },
			req: {
				json: async () => {
					throw new Error("bad");
				},
				param: () => "1",
			},
			json: (d: unknown, s?: number) => new Response(JSON.stringify(d), { status: s ?? 200 }),
			// biome-ignore lint/suspicious/noExplicitAny: test
		} as any;
		const res = await tagsUpdateRoute(ctx);
		expect(res.status).toBe(400);
	});

	test("update tag: bad body", async () => {
		const res = await tagsUpdateRoute(makeCtx(db, { params: { id: "1" }, body: {} }));
		expect(res.status).toBe(400);
	});

	test("update tag: 404 if not found", async () => {
		const res = await tagsUpdateRoute(makeCtx(db, { params: { id: "9999" }, body: { name: "x" } }));
		expect(res.status).toBe(404);
	});

	test("update tag: 409 on duplicate name", async () => {
		const a = await tagsCreateRoute(makeCtx(db, { body: { name: "a" } }));
		await tagsCreateRoute(makeCtx(db, { body: { name: "b" } }));
		const aId = ((await a.json()) as { id: number }).id;
		const res = await tagsUpdateRoute(
			makeCtx(db, { params: { id: String(aId) }, body: { name: "b" } }),
		);
		expect(res.status).toBe(409);
	});

	test("delete tag", async () => {
		const create = await tagsCreateRoute(makeCtx(db, { body: { name: "prod" } }));
		const { id } = (await create.json()) as { id: number };
		const res = await tagsDeleteRoute(makeCtx(db, { params: { id: String(id) } }));
		expect(res.status).toBe(204);
	});

	test("delete tag: invalid ID", async () => {
		const res = await tagsDeleteRoute(makeCtx(db, { params: { id: "x" } }));
		expect(res.status).toBe(400);
	});

	test("delete tag: 404", async () => {
		const res = await tagsDeleteRoute(makeCtx(db, { params: { id: "9999" } }));
		expect(res.status).toBe(404);
	});

	test("tagsByHosts returns grouped map", async () => {
		const c = await tagsCreateRoute(makeCtx(db, { body: { name: "prod" } }));
		const tagId = ((await c.json()) as { id: number }).id;
		await hostTagsAddRoute(makeCtx(db, { params: { id: HOST_ID }, body: { tag_id: tagId } }));
		const res = await tagsByHostsRoute(makeCtx(db));
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown[]>;
		expect(body[HOST_ID]).toHaveLength(1);
	});
});

describe("host-tag routes", () => {
	let db: D1Database;
	let tagA: number;
	let tagB: number;
	const HOST_ID = "h1";

	beforeEach(async () => {
		db = createMockD1();
		await db
			.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, 1)")
			.bind(HOST_ID, "h1.local", Math.floor(Date.now() / 1000))
			.run();
		const aRes = await tagsCreateRoute(makeCtx(db, { body: { name: "a" } }));
		const bRes = await tagsCreateRoute(makeCtx(db, { body: { name: "b" } }));
		tagA = ((await aRes.json()) as { id: number }).id;
		tagB = ((await bRes.json()) as { id: number }).id;
	});

	test("hostTagsList empty by default", async () => {
		const res = await hostTagsListRoute(makeCtx(db, { params: { id: HOST_ID } }));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([]);
	});

	test("hostTagsAdd → list shows tag", async () => {
		const add = await hostTagsAddRoute(
			makeCtx(db, { params: { id: HOST_ID }, body: { tag_id: tagA } }),
		);
		expect(add.status).toBe(201);
		const list = await hostTagsListRoute(makeCtx(db, { params: { id: HOST_ID } }));
		const arr = (await list.json()) as unknown[];
		expect(arr).toHaveLength(1);
	});

	test("hostTagsAdd: bad JSON", async () => {
		const ctx = {
			env: { DB: db },
			req: {
				json: async () => {
					throw new Error("bad");
				},
				param: () => HOST_ID,
			},
			json: (d: unknown, s?: number) => new Response(JSON.stringify(d), { status: s ?? 200 }),
			// biome-ignore lint/suspicious/noExplicitAny: test
		} as any;
		const res = await hostTagsAddRoute(ctx);
		expect(res.status).toBe(400);
	});

	test("hostTagsAdd: bad body", async () => {
		const res = await hostTagsAddRoute(makeCtx(db, { params: { id: HOST_ID }, body: {} }));
		expect(res.status).toBe(400);
	});

	test("hostTagsAdd: host not found", async () => {
		const res = await hostTagsAddRoute(
			makeCtx(db, { params: { id: "unknown-host" }, body: { tag_id: tagA } }),
		);
		expect(res.status).toBe(404);
	});

	test("hostTagsAdd: tag not found", async () => {
		const res = await hostTagsAddRoute(
			makeCtx(db, { params: { id: HOST_ID }, body: { tag_id: 99999 } }),
		);
		expect(res.status).toBe(404);
	});

	test("hostTagsAdd: duplicate ignored", async () => {
		await hostTagsAddRoute(makeCtx(db, { params: { id: HOST_ID }, body: { tag_id: tagA } }));
		const r = await hostTagsAddRoute(
			makeCtx(db, { params: { id: HOST_ID }, body: { tag_id: tagA } }),
		);
		expect(r.status).toBe(201);
	});

	test("hostTagsReplace: set new list", async () => {
		const res = await hostTagsReplaceRoute(
			makeCtx(db, { params: { id: HOST_ID }, body: { tag_ids: [tagA, tagB] } }),
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toHaveLength(2);
	});

	test("hostTagsReplace: bad JSON", async () => {
		const ctx = {
			env: { DB: db },
			req: {
				json: async () => {
					throw new Error("bad");
				},
				param: () => HOST_ID,
			},
			json: (d: unknown, s?: number) => new Response(JSON.stringify(d), { status: s ?? 200 }),
			// biome-ignore lint/suspicious/noExplicitAny: test
		} as any;
		const res = await hostTagsReplaceRoute(ctx);
		expect(res.status).toBe(400);
	});

	test("hostTagsReplace: bad body 400", async () => {
		const res = await hostTagsReplaceRoute(makeCtx(db, { params: { id: HOST_ID }, body: {} }));
		expect(res.status).toBe(400);
	});

	test("hostTagsReplace: too many 422", async () => {
		const tooMany = Array.from({ length: 100 }, (_, i) => i);
		const res = await hostTagsReplaceRoute(
			makeCtx(db, { params: { id: HOST_ID }, body: { tag_ids: tooMany } }),
		);
		expect(res.status).toBe(422);
	});

	test("hostTagsReplace: host 404", async () => {
		const res = await hostTagsReplaceRoute(
			makeCtx(db, { params: { id: "unknown" }, body: { tag_ids: [tagA] } }),
		);
		expect(res.status).toBe(404);
	});

	test("hostTagsReplace: missing tags 404", async () => {
		const res = await hostTagsReplaceRoute(
			makeCtx(db, { params: { id: HOST_ID }, body: { tag_ids: [tagA, 99999] } }),
		);
		expect(res.status).toBe(404);
	});

	test("hostTagsReplace: empty array clears tags", async () => {
		await hostTagsAddRoute(makeCtx(db, { params: { id: HOST_ID }, body: { tag_id: tagA } }));
		const res = await hostTagsReplaceRoute(
			makeCtx(db, { params: { id: HOST_ID }, body: { tag_ids: [] } }),
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([]);
	});

	test("hostTagsRemove: success", async () => {
		await hostTagsAddRoute(makeCtx(db, { params: { id: HOST_ID }, body: { tag_id: tagA } }));
		const res = await hostTagsRemoveRoute(
			makeCtx(db, { params: { id: HOST_ID, tagId: String(tagA) } }),
		);
		expect(res.status).toBe(204);
	});

	test("hostTagsRemove: invalid tag ID", async () => {
		const res = await hostTagsRemoveRoute(makeCtx(db, { params: { id: HOST_ID, tagId: "abc" } }));
		expect(res.status).toBe(400);
	});

	test("hostTagsRemove: assignment not found", async () => {
		const res = await hostTagsRemoveRoute(
			makeCtx(db, { params: { id: HOST_ID, tagId: String(tagA) } }),
		);
		expect(res.status).toBe(404);
	});
});
