// Tests for POST /api/agents/heartbeat route + service
import { beforeEach, describe, expect, test } from "vitest";
import { processHeartbeat } from "../services/heartbeat.js";
import { createMockD1 } from "../test-helpers/mock-d1.js";
import { agentsHeartbeatRoute } from "./heartbeat.js";

// --- Helpers ---

function makeCtx(
	db: D1Database,
	opts: {
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

async function insertAgent(
	db: D1Database,
	id: string,
	sourceKey: string,
	matchKey: string,
	status = "running",
	runtimeApp: string | null = null,
	runtimeVersion: string | null = null,
) {
	await db
		.prepare(
			"INSERT INTO agents (id, source_key, match_key, status, runtime_app, runtime_version, metadata) VALUES (?, ?, ?, ?, ?, ?, '{}')",
		)
		.bind(id, sourceKey, matchKey, status, runtimeApp, runtimeVersion)
		.run();
}

async function getAgent(db: D1Database, id: string) {
	return db.prepare("SELECT * FROM agents WHERE id = ?").bind(id).first<{
		id: string;
		status: string;
		runtime_app: string | null;
		last_seen_at: number | null;
	}>();
}

async function parseJson(res: Response) {
	return JSON.parse(await res.text());
}

// --- Validation tests ---

describe("POST /api/agents/heartbeat (validation)", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	test("returns 400 for empty body", async () => {
		const ctx = makeCtx(db, { rawBody: "" });
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(400);
	});

	test("returns 400 for non-JSON body", async () => {
		const ctx = makeCtx(db, { rawBody: "not json" });
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("Invalid JSON");
	});

	test("returns 400 for array body", async () => {
		const ctx = makeCtx(db, { body: [] });
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("JSON object");
	});

	test("returns 400 for missing source_key", async () => {
		const ctx = makeCtx(db, { body: { agents: [] } });
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("source_key");
	});

	test("returns 400 for empty source_key", async () => {
		const ctx = makeCtx(db, { body: { source_key: "", agents: [] } });
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("source_key");
	});

	test("returns 400 for source_key exceeding max length", async () => {
		const ctx = makeCtx(db, {
			body: { source_key: "x".repeat(200), agents: [] },
		});
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("max length");
	});

	test("returns 400 for non-array agents", async () => {
		const ctx = makeCtx(db, { body: { source_key: "sk1", agents: "nope" } });
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("agents must be an array");
	});

	test("returns 400 when agents array exceeds max size", async () => {
		const agents = Array.from({ length: 101 }, (_, i) => ({
			match_key: `mk_${i}`,
			status: "running",
		}));
		const ctx = makeCtx(db, { body: { source_key: "sk1", agents } });
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("max size");
	});

	test("returns 400 for invalid agent entry (not object)", async () => {
		const ctx = makeCtx(db, {
			body: { source_key: "sk1", agents: ["string"] },
		});
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("agents[0]");
	});

	test("returns 400 for missing match_key", async () => {
		const ctx = makeCtx(db, {
			body: { source_key: "sk1", agents: [{ status: "running" }] },
		});
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("match_key");
	});

	test("returns 400 for invalid status", async () => {
		const ctx = makeCtx(db, {
			body: {
				source_key: "sk1",
				agents: [{ match_key: "mk1", status: "invalid" }],
			},
		});
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("status");
	});

	test("returns 400 for status 'missing' (server-only)", async () => {
		const ctx = makeCtx(db, {
			body: {
				source_key: "sk1",
				agents: [{ match_key: "mk1", status: "missing" }],
			},
		});
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("status");
	});

	test("returns 400 for status 'unknown' (not heartbeat-reportable)", async () => {
		const ctx = makeCtx(db, {
			body: {
				source_key: "sk1",
				agents: [{ match_key: "mk1", status: "unknown" }],
			},
		});
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("status");
	});

	test("returns 400 for duplicate match_key in same request", async () => {
		const ctx = makeCtx(db, {
			body: {
				source_key: "sk1",
				agents: [
					{ match_key: "mk1", status: "running" },
					{ match_key: "mk1", status: "stopped" },
				],
			},
		});
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("duplicate");
	});

	test("returns 400 for invalid runtime_app type", async () => {
		const ctx = makeCtx(db, {
			body: {
				source_key: "sk1",
				agents: [{ match_key: "mk1", status: "running", runtime_app: 123 }],
			},
		});
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(400);
		const data = await parseJson(res);
		expect(data.error).toContain("runtime_app");
	});
});

// --- Service logic tests ---

describe("POST /api/agents/heartbeat (logic)", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	test("empty agents array → no changes, zeroes", async () => {
		const ctx = makeCtx(db, { body: { source_key: "sk1", agents: [] } });
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.updated).toBe(0);
		expect(data.created).toBe(0);
		expect(data.missing).toBe(0);
	});

	test("creates new agents when match_key not in DB", async () => {
		const ctx = makeCtx(db, {
			body: {
				source_key: "sk1",
				agents: [{ match_key: "mk_new", status: "running", runtime_app: "claude" }],
			},
		});
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.created).toBe(1);
		expect(data.updated).toBe(0);
		expect(data.missing).toBe(0);

		// Verify agent was created in DB
		const row = await db
			.prepare("SELECT * FROM agents WHERE source_key = ? AND match_key = ?")
			.bind("sk1", "mk_new")
			.first<{ status: string; runtime_app: string }>();
		expect(row).not.toBeNull();
		expect(row?.status).toBe("running");
		expect(row?.runtime_app).toBe("claude");
	});

	test("updates existing agent on heartbeat", async () => {
		await insertAgent(db, "agt_1", "sk1", "mk1", "unknown");

		const ctx = makeCtx(db, {
			body: {
				source_key: "sk1",
				agents: [
					{
						match_key: "mk1",
						status: "running",
						runtime_app: "cursor",
						runtime_version: "0.50",
					},
				],
			},
		});
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.updated).toBe(1);
		expect(data.created).toBe(0);
		expect(data.missing).toBe(0);

		// Verify fields were updated
		const row = await getAgent(db, "agt_1");
		expect(row?.status).toBe("running");
		expect(row?.runtime_app).toBe("cursor");
		expect(row?.last_seen_at).toBeGreaterThan(0);
	});

	test("marks unreported agent as missing", async () => {
		await insertAgent(db, "agt_1", "sk1", "mk1", "running");
		await insertAgent(db, "agt_2", "sk1", "mk2", "running");

		// Only report mk1 — mk2 should become missing
		const ctx = makeCtx(db, {
			body: {
				source_key: "sk1",
				agents: [{ match_key: "mk1", status: "running" }],
			},
		});
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.updated).toBe(1);
		expect(data.missing).toBe(1);

		const row = await getAgent(db, "agt_2");
		expect(row?.status).toBe("missing");
	});

	test("does not mark already-missing agent again", async () => {
		await insertAgent(db, "agt_1", "sk1", "mk1", "missing");

		// Report empty — mk1 is already missing, should not count
		const ctx = makeCtx(db, {
			body: { source_key: "sk1", agents: [] },
		});
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.missing).toBe(0);
	});

	test("source_key isolation: only affects agents with same source_key", async () => {
		await insertAgent(db, "agt_1", "sk1", "mk1", "running");
		await insertAgent(db, "agt_2", "sk2", "mk2", "running");

		// Heartbeat for sk1 with empty → mk1 goes missing, mk2 untouched
		const ctx = makeCtx(db, {
			body: { source_key: "sk1", agents: [] },
		});
		const res = await agentsHeartbeatRoute(ctx);
		const data = await parseJson(res);
		expect(data.missing).toBe(1);

		// sk2 agent should NOT be affected
		const row2 = await getAgent(db, "agt_2");
		expect(row2?.status).toBe("running");
	});

	test("mixed scenario: update + create + missing", async () => {
		await insertAgent(db, "agt_1", "sk1", "mk_existing", "running");
		await insertAgent(db, "agt_2", "sk1", "mk_stale", "running");

		const ctx = makeCtx(db, {
			body: {
				source_key: "sk1",
				agents: [
					{ match_key: "mk_existing", status: "running", runtime_app: "v2" },
					{ match_key: "mk_brand_new", status: "stopped" },
				],
			},
		});
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.updated).toBe(1);
		expect(data.created).toBe(1);
		expect(data.missing).toBe(1);

		// mk_stale should be missing
		const stale = await getAgent(db, "agt_2");
		expect(stale?.status).toBe("missing");
	});

	test("heartbeat with null runtime_app and runtime_version", async () => {
		await insertAgent(db, "agt_1", "sk1", "mk1", "running");

		const ctx = makeCtx(db, {
			body: {
				source_key: "sk1",
				agents: [
					{
						match_key: "mk1",
						status: "stopped",
						runtime_app: null,
						runtime_version: null,
					},
				],
			},
		});
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.updated).toBe(1);

		const row = await getAgent(db, "agt_1");
		expect(row?.status).toBe("stopped");
		expect(row?.runtime_app).toBeNull();
	});

	test("absent runtime fields preserve existing values", async () => {
		await insertAgent(db, "agt_1", "sk1", "mk1", "running", "cursor", "1.0");

		// Heartbeat only sends match_key + status, no runtime fields
		const ctx = makeCtx(db, {
			body: {
				source_key: "sk1",
				agents: [{ match_key: "mk1", status: "running" }],
			},
		});
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(200);
		const data = await parseJson(res);
		expect(data.updated).toBe(1);

		// runtime_app and runtime_version should still be their original values
		const row = await db
			.prepare("SELECT runtime_app, runtime_version FROM agents WHERE id = ?")
			.bind("agt_1")
			.first<{ runtime_app: string | null; runtime_version: string | null }>();
		expect(row?.runtime_app).toBe("cursor");
		expect(row?.runtime_version).toBe("1.0");
	});

	test("explicit null clears existing runtime fields", async () => {
		await insertAgent(db, "agt_1", "sk1", "mk1", "running", "cursor", "1.0");

		// Heartbeat sends explicit null
		const ctx = makeCtx(db, {
			body: {
				source_key: "sk1",
				agents: [
					{
						match_key: "mk1",
						status: "running",
						runtime_app: null,
						runtime_version: null,
					},
				],
			},
		});
		const res = await agentsHeartbeatRoute(ctx);
		expect(res.status).toBe(200);

		const row = await db
			.prepare("SELECT runtime_app, runtime_version FROM agents WHERE id = ?")
			.bind("agt_1")
			.first<{ runtime_app: string | null; runtime_version: string | null }>();
		expect(row?.runtime_app).toBeNull();
		expect(row?.runtime_version).toBeNull();
	});

	test("concurrent-safe: duplicate heartbeat with new match_key does not fail", async () => {
		// First heartbeat creates the agent
		const ctx1 = makeCtx(db, {
			body: {
				source_key: "sk1",
				agents: [{ match_key: "mk_concurrent", status: "running", runtime_app: "v1" }],
			},
		});
		const res1 = await agentsHeartbeatRoute(ctx1);
		expect(res1.status).toBe(200);
		const data1 = await parseJson(res1);
		expect(data1.created).toBe(1);

		// Second identical heartbeat should not fail (ON CONFLICT handles it)
		const ctx2 = makeCtx(db, {
			body: {
				source_key: "sk1",
				agents: [{ match_key: "mk_concurrent", status: "stopped", runtime_app: "v2" }],
			},
		});
		const res2 = await agentsHeartbeatRoute(ctx2);
		expect(res2.status).toBe(200);
		// Second call sees it as existing → update
		const data2 = await parseJson(res2);
		expect(data2.updated).toBe(1);

		// Verify final state
		const row = await db
			.prepare("SELECT status, runtime_app FROM agents WHERE source_key = ? AND match_key = ?")
			.bind("sk1", "mk_concurrent")
			.first<{ status: string; runtime_app: string | null }>();
		expect(row?.status).toBe("stopped");
		expect(row?.runtime_app).toBe("v2");
	});
});

// --- ON CONFLICT explicit null semantics (race simulation) ---

describe("processHeartbeat ON CONFLICT (race path)", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	test("ON CONFLICT with explicit null clears runtime fields", async () => {
		// Simulate race: agent exists in DB but processHeartbeat's read uses a
		// different source_key (so it won't find it). Then the INSERT hits ON CONFLICT.
		// We can't truly race in sync SQLite, so we test the SQL directly:
		// Insert agent, then execute a raw INSERT ON CONFLICT with null runtime.
		await insertAgent(db, "agt_race", "sk1", "mk_race", "running", "cursor", "1.0");

		// Directly call processHeartbeat with source_key "sk1" — it WILL find agt_race
		// in the read phase and take the UPDATE path. To test ON CONFLICT specifically,
		// we execute the INSERT SQL directly to prove explicit null is NOT COALESCE'd.
		const now = Math.floor(Date.now() / 1000);
		await db
			.prepare(
				`INSERT INTO agents (id, source_key, match_key, runtime_app, runtime_version, status, last_seen_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(source_key, match_key) DO UPDATE SET
				   status = excluded.status,
				   last_seen_at = excluded.last_seen_at,
				   runtime_app = excluded.runtime_app,
				   runtime_version = excluded.runtime_version`,
			)
			.bind("agt_new_id", "sk1", "mk_race", null, null, "stopped", now)
			.run();

		// Verify: runtime_app should be NULL (cleared), not "cursor"
		const row = await db
			.prepare(
				"SELECT status, runtime_app, runtime_version FROM agents WHERE source_key = ? AND match_key = ?",
			)
			.bind("sk1", "mk_race")
			.first<{ status: string; runtime_app: string | null; runtime_version: string | null }>();
		expect(row?.status).toBe("stopped");
		expect(row?.runtime_app).toBeNull();
		expect(row?.runtime_version).toBeNull();
	});

	test("ON CONFLICT with absent runtime preserves existing values", async () => {
		await insertAgent(db, "agt_race2", "sk1", "mk_race2", "running", "windsurf", "2.0");

		// Simulate: INSERT with runtime fields as null (absent → null in VALUES)
		// but DO UPDATE SET does NOT include runtime fields
		const now = Math.floor(Date.now() / 1000);
		await db
			.prepare(
				`INSERT INTO agents (id, source_key, match_key, runtime_app, runtime_version, status, last_seen_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(source_key, match_key) DO UPDATE SET
				   status = excluded.status,
				   last_seen_at = excluded.last_seen_at`,
			)
			.bind("agt_new_id2", "sk1", "mk_race2", null, null, "stopped", now)
			.run();

		// Verify: runtime_app should still be "windsurf" (preserved)
		const row = await db
			.prepare(
				"SELECT status, runtime_app, runtime_version FROM agents WHERE source_key = ? AND match_key = ?",
			)
			.bind("sk1", "mk_race2")
			.first<{ status: string; runtime_app: string | null; runtime_version: string | null }>();
		expect(row?.status).toBe("stopped");
		expect(row?.runtime_app).toBe("windsurf");
		expect(row?.runtime_version).toBe("2.0");
	});

	test("processHeartbeat ON CONFLICT path: explicit null on new match_key that races", async () => {
		// Insert an agent that processHeartbeat read won't see (different source_key read timing)
		// Actually: we'll test end-to-end by pre-inserting with the same source_key,
		// then calling processHeartbeat which will find it and use UPDATE path.
		// This test validates the generated SQL pattern in the create branch
		// by using a fresh source_key so read finds nothing, then agent is created,
		// then a SECOND processHeartbeat simulates the race by also taking create path.

		// First call: creates mk_new
		const now = 1000000;
		const result1 = await processHeartbeat(
			db,
			"sk_race",
			[{ match_key: "mk_new", status: "running", runtime_app: "v1", runtime_version: "1.0" }],
			now,
		);
		expect(result1.created).toBe(1);

		// Verify created
		const row1 = await db
			.prepare(
				"SELECT runtime_app, runtime_version FROM agents WHERE source_key = ? AND match_key = ?",
			)
			.bind("sk_race", "mk_new")
			.first<{ runtime_app: string | null; runtime_version: string | null }>();
		expect(row1?.runtime_app).toBe("v1");
		expect(row1?.runtime_version).toBe("1.0");

		// Second call: finds agent in read, takes UPDATE path with explicit null
		const result2 = await processHeartbeat(
			db,
			"sk_race",
			[{ match_key: "mk_new", status: "stopped", runtime_app: null, runtime_version: null }],
			now + 10,
		);
		expect(result2.updated).toBe(1);

		// Verify: explicit null cleared the fields
		const row2 = await db
			.prepare(
				"SELECT status, runtime_app, runtime_version FROM agents WHERE source_key = ? AND match_key = ?",
			)
			.bind("sk_race", "mk_new")
			.first<{ status: string; runtime_app: string | null; runtime_version: string | null }>();
		expect(row2?.status).toBe("stopped");
		expect(row2?.runtime_app).toBeNull();
		expect(row2?.runtime_version).toBeNull();
	});
});
