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

		describe("KV throttle (Task #15 T2)", () => {
			interface PutEntry {
				value: string;
				ttl?: number;
			}
			function makeKv() {
				const store = new Map<string, PutEntry>();
				return {
					store,
					kv: {
						get: async (key: string, type?: "json" | "text") => {
							const entry = store.get(key);
							if (!entry) {
								return null;
							}
							return type === "json" ? JSON.parse(entry.value) : entry.value;
						},
						put: async (key: string, value: string, opts?: { expirationTtl?: number }) => {
							store.set(key, { value, ttl: opts?.expirationTtl });
						},
						delete: async (key: string) => {
							store.delete(key);
						},
						list: async () => ({ keys: [], list_complete: true, cursor: "" }),
						getWithMetadata: async () => ({ value: null, metadata: null }),
					} as unknown as KVNamespace,
				};
			}

			test("first heartbeat with KV writes a snapshot AND keeps the D1 UPDATE", async () => {
				await repo.upsertBy({ source_key: "src-kv", match_key: "alpha", status: "running" }, {});
				const { kv, store } = makeKv();
				await repo.processHeartbeat(
					"src-kv",
					[{ match_key: "alpha", status: "running" }],
					NOW + 30,
					{ kv },
				);
				expect(store.has("bat:agent:state:src-kv:alpha")).toBe(true);
				const entry = store.get("bat:agent:state:src-kv:alpha");
				const snap = JSON.parse(entry?.value ?? "{}");
				expect(snap.last_flush_at).toBe(NOW + 30);
				expect(snap.status).toBe("running");
			});

			test("second heartbeat within 5min with same status → D1 last_seen_at unchanged", async () => {
				const seeded = await repo.upsertBy(
					{ source_key: "src-kv2", match_key: "alpha", status: "running" },
					{},
				);
				const { kv } = makeKv();
				// First call: D1 UPDATE runs (last_seen_at = NOW+10)
				await repo.processHeartbeat(
					"src-kv2",
					[{ match_key: "alpha", status: "running" }],
					NOW + 10,
					{ kv },
				);
				const flushedRow = await repo.getById(seeded.id);
				expect(flushedRow?.last_seen_at).toBe(NOW + 10);

				// Second call 60s later, identical status → throttled, last_seen_at stays
				const result = await repo.processHeartbeat(
					"src-kv2",
					[{ match_key: "alpha", status: "running" }],
					NOW + 70,
					{ kv },
				);
				expect(result.updated).toBe(1); // counter still reflects the entry
				const stale = await repo.getById(seeded.id);
				expect(stale?.last_seen_at).toBe(NOW + 10); // D1 NOT touched
			});

			test("second heartbeat with status change always flushes immediately", async () => {
				const seeded = await repo.upsertBy(
					{ source_key: "src-kv3", match_key: "alpha", status: "running" },
					{},
				);
				const { kv } = makeKv();
				await repo.processHeartbeat(
					"src-kv3",
					[{ match_key: "alpha", status: "running" }],
					NOW + 10,
					{ kv },
				);
				await repo.processHeartbeat(
					"src-kv3",
					[{ match_key: "alpha", status: "stopped" }],
					NOW + 70,
					{ kv },
				);
				const row = await repo.getById(seeded.id);
				expect(row?.status).toBe("stopped");
				expect(row?.last_seen_at).toBe(NOW + 70);
			});

			test("after throttle window expires, next heartbeat flushes", async () => {
				const seeded = await repo.upsertBy(
					{ source_key: "src-kv4", match_key: "alpha", status: "running" },
					{},
				);
				const { kv } = makeKv();
				await repo.processHeartbeat("src-kv4", [{ match_key: "alpha", status: "running" }], NOW, {
					kv,
				});
				// 6 minutes later — outside the 5min throttle window
				await repo.processHeartbeat(
					"src-kv4",
					[{ match_key: "alpha", status: "running" }],
					NOW + 360,
					{ kv },
				);
				const row = await repo.getById(seeded.id);
				expect(row?.last_seen_at).toBe(NOW + 360);
			});

			test("KV failure on read → flush always happens (fallback)", async () => {
				const seeded = await repo.upsertBy(
					{ source_key: "src-kv5", match_key: "alpha", status: "running" },
					{},
				);
				const failingKv = {
					get: async () => {
						throw new Error("kv outage");
					},
					put: async () => {
						/* no-op */
					},
					delete: async () => {
						/* no-op */
					},
					list: async () => ({ keys: [], list_complete: true, cursor: "" }),
					getWithMetadata: async () => ({ value: null, metadata: null }),
				} as unknown as KVNamespace;

				await repo.processHeartbeat(
					"src-kv5",
					[{ match_key: "alpha", status: "running" }],
					NOW + 10,
					{ kv: failingKv },
				);
				await repo.processHeartbeat(
					"src-kv5",
					[{ match_key: "alpha", status: "running" }],
					NOW + 70,
					{ kv: failingKv },
				);
				const row = await repo.getById(seeded.id);
				// Without a usable snapshot, both calls flush → second updates last_seen_at
				expect(row?.last_seen_at).toBe(NOW + 70);
			});

			test("missing diff (unreported existing) still flushes from D1 SELECT, regardless of KV", async () => {
				const a = await repo.upsertBy(
					{ source_key: "src-kv6", match_key: "alpha", status: "running" },
					{},
				);
				const b = await repo.upsertBy(
					{ source_key: "src-kv6", match_key: "beta", status: "running" },
					{},
				);
				const { kv } = makeKv();
				const result = await repo.processHeartbeat(
					"src-kv6",
					[{ match_key: "alpha", status: "running" }],
					NOW + 10,
					{ kv },
				);
				expect(result).toEqual({ updated: 1, created: 0, missing: 1 });
				const beta = await repo.getById(b.id);
				expect(beta?.status).toBe("missing");
				// alpha flushed too (first call has no snapshot)
				expect((await repo.getById(a.id))?.last_seen_at).toBe(NOW + 10);
			});

			test("custom throttleSeconds shortens the window", async () => {
				const seeded = await repo.upsertBy(
					{ source_key: "src-kv7", match_key: "alpha", status: "running" },
					{},
				);
				const { kv } = makeKv();
				await repo.processHeartbeat("src-kv7", [{ match_key: "alpha", status: "running" }], NOW, {
					kv,
					throttleSeconds: 30,
				});
				await repo.processHeartbeat(
					"src-kv7",
					[{ match_key: "alpha", status: "running" }],
					NOW + 31,
					{ kv, throttleSeconds: 30 },
				);
				expect((await repo.getById(seeded.id))?.last_seen_at).toBe(NOW + 31);
			});

			test("runtime_version change within throttle window forces flush", async () => {
				const seeded = await repo.upsertBy(
					{
						source_key: "src-kv8",
						match_key: "alpha",
						status: "running",
					},
					{ runtime_version: "1.0.0" },
				);
				const { kv } = makeKv();
				await repo.processHeartbeat(
					"src-kv8",
					[{ match_key: "alpha", status: "running", runtime_version: "1.0.0" }],
					NOW + 10,
					{ kv },
				);
				await repo.processHeartbeat(
					"src-kv8",
					[{ match_key: "alpha", status: "running", runtime_version: "1.0.1" }],
					NOW + 70,
					{ kv },
				);
				const row = await repo.getById(seeded.id);
				expect(row?.runtime_version).toBe("1.0.1");
				expect(row?.last_seen_at).toBe(NOW + 70);
			});
		});
	});
});
