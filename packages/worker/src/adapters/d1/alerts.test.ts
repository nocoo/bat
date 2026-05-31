// AlertsRepository contract tests. Behavioral coverage of the rule
// evaluators and the SQL planning lives in `_alerts-tier1.test.ts` and
// `_alerts-tier2.test.ts`; this suite verifies the public repo surface
// (`listActiveJoinedHosts` join + `evaluateAndApply{,Tier2}` delegation).

import type { MetricsPayload, Tier2Payload } from "@bat/shared";
import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../../test-helpers/mock-d1";
import { D1AlertsRepository } from "./alerts";

const HOST_A = "host-a";
const HOST_B = "host-b";
const NOW = 1_730_000_000;

async function seedHost(db: D1Database, hostId: string, hostname: string, isActive = 1) {
	await db
		.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, ?)")
		.bind(hostId, hostname, NOW, isActive)
		.run();
}

async function insertActiveAlert(
	db: D1Database,
	hostId: string,
	ruleId: string,
	severity: string,
	value: number,
	triggeredAt: number,
	message: string,
) {
	await db
		.prepare(
			"INSERT INTO alert_states (host_id, rule_id, severity, value, triggered_at, message) VALUES (?, ?, ?, ?, ?, ?)",
		)
		.bind(hostId, ruleId, severity, value, triggeredAt, message)
		.run();
}

function makeMetricsPayload(
	hostId: string,
	overrides: Partial<MetricsPayload> = {},
): MetricsPayload {
	return {
		host_id: hostId,
		timestamp: NOW,
		interval: 30,
		uptime_seconds: 86_400,
		cpu: {
			usage_pct: 10,
			iowait_pct: 0,
			steal_pct: 0,
			load1: 0.1,
			load5: 0.1,
			load15: 0.1,
			count: 4,
		},
		mem: { total_bytes: 8_000_000_000, available_bytes: 4_000_000_000, used_pct: 50 },
		swap: { total_bytes: 2_000_000_000, used_bytes: 0, used_pct: 0 },
		disk: [
			{
				mount: "/",
				fs_type: "ext4",
				total_bytes: 100_000_000_000,
				available_bytes: 60_000_000_000,
				used_pct: 40,
			},
		],
		net: [],
		...overrides,
	};
}

function makeTier2Payload(hostId: string, overrides: Partial<Tier2Payload> = {}): Tier2Payload {
	return { host_id: hostId, timestamp: NOW, ...overrides };
}

describe("D1AlertsRepository", () => {
	let db: D1Database;
	let repo: D1AlertsRepository;
	beforeEach(async () => {
		db = createMockD1();
		repo = new D1AlertsRepository(db);
		await seedHost(db, HOST_A, "a.example.com");
		await seedHost(db, HOST_B, "b.example.com");
	});

	describe("listActiveJoinedHosts", () => {
		test("returns alerts joined with hostname + maintenance, ordered by triggered_at desc", async () => {
			await insertActiveAlert(db, HOST_A, "disk_full", "critical", 95, NOW + 10, "/ at 95%");
			await insertActiveAlert(db, HOST_A, "iowait_high", "warning", 25, NOW + 20, "iowait 25%");
			await insertActiveAlert(db, HOST_B, "mem_high", "critical", 90, NOW + 15, "mem 90%");

			const rows = await repo.listActiveJoinedHosts();
			expect(rows.map((r) => r.rule_id)).toEqual(["iowait_high", "mem_high", "disk_full"]);
			expect(rows.find((r) => r.rule_id === "mem_high")?.hostname).toBe("b.example.com");
		});

		test("excludes alerts on retired hosts", async () => {
			await db.prepare("UPDATE hosts SET is_active = 0 WHERE host_id = ?").bind(HOST_B).run();
			await insertActiveAlert(db, HOST_A, "x", "critical", 1, NOW, "");
			await insertActiveAlert(db, HOST_B, "y", "critical", 1, NOW, "");

			const rows = await repo.listActiveJoinedHosts();
			expect(rows.map((r) => r.host_id)).toEqual([HOST_A]);
		});

		test("returns empty array when no alerts", async () => {
			expect(await repo.listActiveJoinedHosts()).toEqual([]);
		});

		test("includes maintenance window fields when set", async () => {
			await db
				.prepare("UPDATE hosts SET maintenance_start = ?, maintenance_end = ? WHERE host_id = ?")
				.bind("01:00", "02:00", HOST_A)
				.run();
			await insertActiveAlert(db, HOST_A, "x", "critical", 1, NOW, "");

			const rows = await repo.listActiveJoinedHosts();
			expect(rows[0]?.maintenance_start).toBe("01:00");
			expect(rows[0]?.maintenance_end).toBe("02:00");
		});
	});

	describe("evaluateAndApply", () => {
		test("delegates to the tier-1 evaluator and persists fired alerts", async () => {
			// Trip mem_high: mem.used_pct > 85 AND swap.used_pct > 50.
			const payload = makeMetricsPayload(HOST_A, {
				mem: { total_bytes: 8_000_000_000, available_bytes: 100_000_000, used_pct: 90 },
				swap: { total_bytes: 2_000_000_000, used_bytes: 1_500_000_000, used_pct: 75 },
			});
			await repo.evaluateAndApply(HOST_A, payload, NOW);

			const states = await db
				.prepare("SELECT rule_id, severity FROM alert_states WHERE host_id = ?")
				.bind(HOST_A)
				.all<{ rule_id: string; severity: string }>();
			expect(states.results.find((r) => r.rule_id === "mem_high")?.severity).toBe("critical");
		});

		test("idempotent on healthy payload (no writes)", async () => {
			await repo.evaluateAndApply(HOST_A, makeMetricsPayload(HOST_A), NOW);
			const states = await db
				.prepare("SELECT COUNT(*) as cnt FROM alert_states WHERE host_id = ?")
				.bind(HOST_A)
				.first<{ cnt: number }>();
			expect(states?.cnt ?? 0).toBe(0);
		});
	});

	describe("evaluateAndApplyTier2", () => {
		test("delegates to the tier-2 evaluator and persists fired alerts", async () => {
			// Trip ssh_root_login.
			const payload = makeTier2Payload(HOST_A, {
				security: {
					ssh_password_auth: false,
					ssh_root_login: "yes",
					firewall_active: true,
					firewall_default_policy: "deny",
				},
			});
			await repo.evaluateAndApplyTier2(HOST_A, payload, NOW);

			const states = await db
				.prepare("SELECT rule_id FROM alert_states WHERE host_id = ?")
				.bind(HOST_A)
				.all<{ rule_id: string }>();
			expect(states.results.map((r) => r.rule_id)).toContain("ssh_root_login");
		});

		test("uses port_allowlist when evaluating public_port rule", async () => {
			await db
				.prepare("INSERT INTO port_allowlist (host_id, port, reason) VALUES (?, ?, ?)")
				.bind(HOST_A, 7777, "test")
				.run();
			const payload = makeTier2Payload(HOST_A, {
				ports: {
					listening: [{ port: 7777, bind: "0.0.0.0", protocol: "tcp" }],
				},
			});
			await repo.evaluateAndApplyTier2(HOST_A, payload, NOW);
			const states = await db
				.prepare("SELECT COUNT(*) as cnt FROM alert_states WHERE host_id = ? AND rule_id = ?")
				.bind(HOST_A, "public_port")
				.first<{ cnt: number }>();
			expect(states?.cnt ?? 0).toBe(0);
		});
	});

	describe("clearPendingForHost", () => {
		test("deletes only this host's pending rows; leaves other hosts and alert_states untouched", async () => {
			// Seed pending + active rows on both hosts.
			await db
				.prepare(
					"INSERT INTO alert_pending (host_id, rule_id, first_seen, last_value) VALUES (?, ?, ?, ?)",
				)
				.bind(HOST_A, "iowait_high", NOW, 25)
				.run();
			await db
				.prepare(
					"INSERT INTO alert_pending (host_id, rule_id, first_seen, last_value) VALUES (?, ?, ?, ?)",
				)
				.bind(HOST_B, "iowait_high", NOW, 25)
				.run();
			await insertActiveAlert(db, HOST_A, "disk_full", "critical", 90, NOW, "/ at 90%");

			await repo.clearPendingForHost(HOST_A);

			const aPending = await db
				.prepare("SELECT COUNT(*) as cnt FROM alert_pending WHERE host_id = ?")
				.bind(HOST_A)
				.first<{ cnt: number }>();
			expect(aPending?.cnt).toBe(0);

			const bPending = await db
				.prepare("SELECT COUNT(*) as cnt FROM alert_pending WHERE host_id = ?")
				.bind(HOST_B)
				.first<{ cnt: number }>();
			expect(bPending?.cnt).toBe(1);

			// alert_states untouched
			const aActive = await db
				.prepare("SELECT COUNT(*) as cnt FROM alert_states WHERE host_id = ?")
				.bind(HOST_A)
				.first<{ cnt: number }>();
			expect(aActive?.cnt).toBe(1);
		});

		test("no-op when host has no pending rows", async () => {
			await expect(repo.clearPendingForHost(HOST_A)).resolves.toBeUndefined();
		});

		test("invalidates the healthy sentinel when KV is provided (Task #16 T3)", async () => {
			const store = new Map<string, { value: string; ttl?: number }>();
			const kv = {
				get: async (key: string) => store.get(key)?.value ?? null,
				put: async (key: string, value: string, opts?: { expirationTtl?: number }) => {
					store.set(key, { value, ttl: opts?.expirationTtl });
				},
				delete: async (key: string) => {
					store.delete(key);
				},
				list: async () => ({ keys: [], list_complete: true, cursor: "" }),
				getWithMetadata: async () => ({ value: null, metadata: null }),
			} as unknown as KVNamespace;
			store.set(`bat:host:alerts:empty:${HOST_A}`, { value: "1" });

			await repo.clearPendingForHost(HOST_A, { kv });
			expect(store.has(`bat:host:alerts:empty:${HOST_A}`)).toBe(false);
		});

		test("works without KV (no-op invalidate)", async () => {
			await expect(repo.clearPendingForHost(HOST_A, {})).resolves.toBeUndefined();
		});
	});

	describe("listForHosts + countByHost (read-model for hosts list/detail/fleet/monitoring)", () => {
		test("listForHosts returns alert read rows scoped to the given hosts", async () => {
			await insertActiveAlert(db, HOST_A, "cpu_high", "warning", 80, NOW + 1, "cpu");
			await insertActiveAlert(db, HOST_B, "mem_high", "critical", 90, NOW + 2, "mem");
			const rows = await repo.listForHosts([HOST_A]);
			expect(rows.map((r) => r.rule_id)).toEqual(["cpu_high"]);
			expect(rows[0]).toMatchObject({
				host_id: HOST_A,
				severity: "warning",
				rule_id: "cpu_high",
				message: "cpu",
				value: 80,
				triggered_at: NOW + 1,
			});
		});
		test("listForHosts empty input → empty without DB call", async () => {
			expect(await repo.listForHosts([])).toEqual([]);
		});
		test("countByHost returns counts grouped by host (only for hosts with alerts)", async () => {
			await insertActiveAlert(db, HOST_A, "r1", "warning", 1, NOW, "");
			await insertActiveAlert(db, HOST_A, "r2", "critical", 1, NOW, "");
			await insertActiveAlert(db, HOST_B, "r3", "warning", 1, NOW, "");
			const counts = await repo.countByHost([HOST_A, HOST_B, "host-c"]);
			expect(counts.get(HOST_A)).toBe(2);
			expect(counts.get(HOST_B)).toBe(1);
			expect(counts.has("host-c")).toBe(false);
		});
		test("countByHost empty input → empty map without DB call", async () => {
			expect((await repo.countByHost([])).size).toBe(0);
		});
	});
});
