import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { MetricsPayload } from "@bat/shared";
import { createMockD1 } from "../test-helpers/mock-d1";
import { evaluateAlerts, evaluateRules } from "./alerts";

function makePayload(overrides?: Partial<{
	mem_used_pct: number;
	swap_used_pct: number;
	swap_total_bytes: number;
	disk_used_pct: number;
	iowait_pct: number;
	steal_pct: number;
}>): MetricsPayload {
	return {
		host_id: "test-host",
		timestamp: Math.floor(Date.now() / 1000),
		interval: 30,
		cpu: {
			load1: 0.5,
			load5: 0.3,
			load15: 0.2,
			usage_pct: 10,
			iowait_pct: overrides?.iowait_pct ?? 1,
			steal_pct: overrides?.steal_pct ?? 0,
			count: 2,
		},
		mem: {
			total_bytes: 4_000_000_000,
			available_bytes: 2_000_000_000,
			used_pct: overrides?.mem_used_pct ?? 50,
		},
		swap: {
			total_bytes: overrides?.swap_total_bytes ?? 2_000_000_000,
			used_bytes: 100_000_000,
			used_pct: overrides?.swap_used_pct ?? 5,
		},
		disk: [
			{
				mount: "/",
				total_bytes: 100_000_000_000,
				avail_bytes: 50_000_000_000,
				used_pct: overrides?.disk_used_pct ?? 50,
			},
		],
		net: [
			{
				iface: "eth0",
				rx_bytes_rate: 1000,
				tx_bytes_rate: 500,
				rx_errors: 0,
				tx_errors: 0,
			},
		],
		uptime_seconds: 86400,
	};
}

describe("evaluateRules (pure function)", () => {
	test("healthy payload fires no rules", () => {
		const results = evaluateRules(makePayload());
		expect(results.every((r) => !r.fired)).toBe(true);
	});

	test("mem_high fires when mem > 85% AND swap > 50%", () => {
		const results = evaluateRules(makePayload({ mem_used_pct: 90, swap_used_pct: 60 }));
		const memHigh = results.find((r) => r.ruleId === "mem_high");
		expect(memHigh?.fired).toBe(true);
		expect(memHigh?.severity).toBe("critical");
	});

	test("mem_high does not fire when only mem > 85% but swap < 50%", () => {
		const results = evaluateRules(makePayload({ mem_used_pct: 90, swap_used_pct: 30 }));
		const memHigh = results.find((r) => r.ruleId === "mem_high");
		expect(memHigh?.fired).toBe(false);
	});

	test("no_swap fires when swap == 0 AND mem > 70%", () => {
		const results = evaluateRules(
			makePayload({ swap_total_bytes: 0, mem_used_pct: 75 }),
		);
		const noSwap = results.find((r) => r.ruleId === "no_swap");
		expect(noSwap?.fired).toBe(true);
		expect(noSwap?.severity).toBe("critical");
	});

	test("no_swap does not fire when swap > 0", () => {
		const results = evaluateRules(makePayload({ mem_used_pct: 75 }));
		const noSwap = results.find((r) => r.ruleId === "no_swap");
		expect(noSwap?.fired).toBe(false);
	});

	test("disk_full fires when any mount > 85%", () => {
		const results = evaluateRules(makePayload({ disk_used_pct: 90 }));
		const diskFull = results.find((r) => r.ruleId === "disk_full");
		expect(diskFull?.fired).toBe(true);
		expect(diskFull?.severity).toBe("critical");
	});

	test("disk_full does not fire at exactly 85%", () => {
		const results = evaluateRules(makePayload({ disk_used_pct: 85 }));
		const diskFull = results.find((r) => r.ruleId === "disk_full");
		expect(diskFull?.fired).toBe(false);
	});

	test("iowait_high fires when iowait > 20%", () => {
		const results = evaluateRules(makePayload({ iowait_pct: 25 }));
		const iowait = results.find((r) => r.ruleId === "iowait_high");
		expect(iowait?.fired).toBe(true);
		expect(iowait?.severity).toBe("warning");
		expect(iowait?.durationSeconds).toBe(300);
	});

	test("steal_high fires when steal > 10%", () => {
		const results = evaluateRules(makePayload({ steal_pct: 15 }));
		const steal = results.find((r) => r.ruleId === "steal_high");
		expect(steal?.fired).toBe(true);
		expect(steal?.severity).toBe("warning");
		expect(steal?.durationSeconds).toBe(300);
	});

	test("exactly at threshold does not fire (strict >)", () => {
		const results = evaluateRules(makePayload({ iowait_pct: 20 }));
		const iowait = results.find((r) => r.ruleId === "iowait_high");
		expect(iowait?.fired).toBe(false);
	});
});

describe("evaluateAlerts (with D1 mock)", () => {
	let db: D1Database;
	const hostId = "test-host";
	const now = Math.floor(Date.now() / 1000);

	beforeEach(() => {
		db = createMockD1();
		// Insert host to satisfy FK
		db.prepare("INSERT INTO hosts (host_id, hostname, last_seen) VALUES (?, ?, ?)")
			.bind(hostId, "test-host", now)
			.run();
	});

	test("instant rule fires and creates alert_states row", async () => {
		const payload = makePayload({ disk_used_pct: 90 });
		await evaluateAlerts(db, hostId, payload, now);

		const alert = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "disk_full")
			.first<{ severity: string; value: number }>();

		expect(alert).not.toBeNull();
		expect(alert?.severity).toBe("critical");
		expect(alert?.value).toBe(90);
	});

	test("instant rule clears alert_states when condition clears", async () => {
		// First: fire the alert
		await evaluateAlerts(db, hostId, makePayload({ disk_used_pct: 90 }), now);
		const before = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "disk_full")
			.first();
		expect(before).not.toBeNull();

		// Then: condition clears
		await evaluateAlerts(db, hostId, makePayload({ disk_used_pct: 50 }), now + 30);
		const after = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "disk_full")
			.first();
		expect(after).toBeNull();
	});

	test("duration rule tracks in alert_pending first", async () => {
		const payload = makePayload({ iowait_pct: 25 });
		await evaluateAlerts(db, hostId, payload, now);

		// Should be in alert_pending, not yet in alert_states
		const pending = await db
			.prepare("SELECT * FROM alert_pending WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "iowait_high")
			.first<{ first_seen: number }>();
		expect(pending).not.toBeNull();
		expect(pending?.first_seen).toBe(now);

		const alert = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "iowait_high")
			.first();
		expect(alert).toBeNull();
	});

	test("duration rule promotes to alert_states after 5 min", async () => {
		const payload = makePayload({ iowait_pct: 25 });

		// First sample at t=0
		await evaluateAlerts(db, hostId, payload, now);

		// Second sample at t=300 (exactly at 5 min boundary)
		await evaluateAlerts(db, hostId, payload, now + 300);

		const alert = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "iowait_high")
			.first<{ severity: string }>();
		expect(alert).not.toBeNull();
		expect(alert?.severity).toBe("warning");
	});

	test("duration rule does not promote before 5 min", async () => {
		const payload = makePayload({ iowait_pct: 25 });

		// First sample at t=0
		await evaluateAlerts(db, hostId, payload, now);
		// Second sample at t=270 (4.5 min — not yet)
		await evaluateAlerts(db, hostId, payload, now + 270);

		const alert = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "iowait_high")
			.first();
		expect(alert).toBeNull();
	});

	test("duration rule clears both tables when condition clears", async () => {
		// Start tracking
		await evaluateAlerts(db, hostId, makePayload({ iowait_pct: 25 }), now);

		// Promote after 5 min
		await evaluateAlerts(db, hostId, makePayload({ iowait_pct: 25 }), now + 300);

		// Condition clears
		await evaluateAlerts(db, hostId, makePayload({ iowait_pct: 5 }), now + 330);

		const pending = await db
			.prepare("SELECT * FROM alert_pending WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "iowait_high")
			.first();
		const alert = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "iowait_high")
			.first();

		expect(pending).toBeNull();
		expect(alert).toBeNull();
	});

	test("multiple rules can fire simultaneously", async () => {
		const payload = makePayload({
			disk_used_pct: 95,
			mem_used_pct: 90,
			swap_used_pct: 60,
		});
		await evaluateAlerts(db, hostId, payload, now);

		const alerts = await db
			.prepare("SELECT rule_id FROM alert_states WHERE host_id = ?")
			.bind(hostId)
			.all<{ rule_id: string }>();

		const ruleIds = alerts.results.map((a) => a.rule_id).sort();
		expect(ruleIds).toContain("disk_full");
		expect(ruleIds).toContain("mem_high");
	});
});
