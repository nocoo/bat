import type { Tier2Payload } from "@bat/shared";
import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../test-helpers/mock-d1";
import {
	type AlertEvalResult,
	evaluateTier2Alerts,
	evaluateTier2Rules,
	handleDurationRule,
} from "./tier2-alerts";

function makePayload(overrides?: Partial<Tier2Payload>): Tier2Payload {
	const now = Math.floor(Date.now() / 1000);
	return {
		host_id: "host-001",
		timestamp: now,
		...overrides,
	};
}

describe("evaluateTier2Rules", () => {
	test("ssh_password_auth fires when true", () => {
		const results = evaluateTier2Rules(
			makePayload({
				security: {
					ssh_password_auth: true,
					ssh_root_login: "no",
					ssh_failed_logins_7d: 0,
					firewall_active: true,
					firewall_default_policy: "deny",
					fail2ban_active: true,
					fail2ban_banned_count: 0,
					unattended_upgrades_active: true,
				},
			}),
		);
		const rule = results.find((r) => r.ruleId === "ssh_password_auth");
		expect(rule).toBeDefined();
		expect(rule?.fired).toBe(true);
		expect(rule?.severity).toBe("critical");
	});

	test("ssh_password_auth clears when false", () => {
		const results = evaluateTier2Rules(
			makePayload({
				security: {
					ssh_password_auth: false,
					ssh_root_login: null,
					ssh_failed_logins_7d: null,
					firewall_active: null,
					firewall_default_policy: null,
					fail2ban_active: null,
					fail2ban_banned_count: null,
					unattended_upgrades_active: null,
				},
			}),
		);
		const rule = results.find((r) => r.ruleId === "ssh_password_auth");
		expect(rule?.fired).toBe(false);
	});

	test("ssh_root_login fires when yes", () => {
		const results = evaluateTier2Rules(
			makePayload({
				security: {
					ssh_password_auth: false,
					ssh_root_login: "yes",
					ssh_failed_logins_7d: null,
					firewall_active: null,
					firewall_default_policy: null,
					fail2ban_active: null,
					fail2ban_banned_count: null,
					unattended_upgrades_active: null,
				},
			}),
		);
		const rule = results.find((r) => r.ruleId === "ssh_root_login");
		expect(rule?.fired).toBe(true);
		expect(rule?.severity).toBe("critical");
	});

	test("ssh_root_login clears for prohibit-password", () => {
		const results = evaluateTier2Rules(
			makePayload({
				security: {
					ssh_password_auth: false,
					ssh_root_login: "prohibit-password",
					ssh_failed_logins_7d: null,
					firewall_active: null,
					firewall_default_policy: null,
					fail2ban_active: null,
					fail2ban_banned_count: null,
					unattended_upgrades_active: null,
				},
			}),
		);
		const rule = results.find((r) => r.ruleId === "ssh_root_login");
		expect(rule?.fired).toBe(false);
	});

	test("no_firewall fires when false", () => {
		const results = evaluateTier2Rules(
			makePayload({
				security: {
					ssh_password_auth: null,
					ssh_root_login: null,
					ssh_failed_logins_7d: null,
					firewall_active: false,
					firewall_default_policy: null,
					fail2ban_active: null,
					fail2ban_banned_count: null,
					unattended_upgrades_active: null,
				},
			}),
		);
		const rule = results.find((r) => r.ruleId === "no_firewall");
		expect(rule?.fired).toBe(true);
		expect(rule?.severity).toBe("critical");
	});

	test("no_firewall clears when true", () => {
		const results = evaluateTier2Rules(
			makePayload({
				security: {
					ssh_password_auth: null,
					ssh_root_login: null,
					ssh_failed_logins_7d: null,
					firewall_active: true,
					firewall_default_policy: "deny",
					fail2ban_active: null,
					fail2ban_banned_count: null,
					unattended_upgrades_active: null,
				},
			}),
		);
		const rule = results.find((r) => r.ruleId === "no_firewall");
		expect(rule?.fired).toBe(false);
	});

	test("public_port fires for non-allowlisted port on 0.0.0.0", () => {
		const results = evaluateTier2Rules(
			makePayload({
				ports: {
					listening: [
						{ port: 22, bind: "0.0.0.0", protocol: "tcp", pid: 1, process: "sshd" },
						{ port: 3306, bind: "0.0.0.0", protocol: "tcp", pid: 2, process: "mysql" },
						{ port: 5432, bind: "127.0.0.1", protocol: "tcp", pid: 3, process: "postgres" },
					],
				},
			}),
		);
		const rule = results.find((r) => r.ruleId === "public_port");
		expect(rule?.fired).toBe(true);
		expect(rule?.value).toBe(1); // only 3306 is non-allowlisted and public
		expect(rule?.message).toContain("3306");
	});

	test("public_port clears when all ports in allowlist", () => {
		const results = evaluateTier2Rules(
			makePayload({
				ports: {
					listening: [
						{ port: 22, bind: "0.0.0.0", protocol: "tcp", pid: 1, process: "sshd" },
						{ port: 80, bind: "::", protocol: "tcp6", pid: 2, process: "nginx" },
						{ port: 443, bind: "::", protocol: "tcp6", pid: 3, process: "nginx" },
					],
				},
			}),
		);
		const rule = results.find((r) => r.ruleId === "public_port");
		expect(rule?.fired).toBe(false);
	});

	test("public_port ignores localhost bindings", () => {
		const results = evaluateTier2Rules(
			makePayload({
				ports: {
					listening: [
						{ port: 3306, bind: "127.0.0.1", protocol: "tcp", pid: 1, process: "mysql" },
						{ port: 6379, bind: "::1", protocol: "tcp6", pid: 2, process: "redis" },
					],
				},
			}),
		);
		const rule = results.find((r) => r.ruleId === "public_port");
		expect(rule?.fired).toBe(false);
	});

	test("container_restart fires when restart_count > threshold", () => {
		const results = evaluateTier2Rules(
			makePayload({
				docker: {
					installed: true,
					version: "24.0",
					containers: [
						{
							id: "a",
							name: "web",
							image: "nginx",
							status: "Up",
							state: "running",
							cpu_pct: 1,
							mem_bytes: 100,
							restart_count: 10,
							started_at: null,
						},
						{
							id: "b",
							name: "db",
							image: "postgres",
							status: "Up",
							state: "running",
							cpu_pct: 2,
							mem_bytes: 200,
							restart_count: 2,
							started_at: null,
						},
					],
					images: null,
				},
			}),
		);
		const rule = results.find((r) => r.ruleId === "container_restart");
		expect(rule?.fired).toBe(true);
		expect(rule?.severity).toBe("critical");
		expect(rule?.value).toBe(10);
		expect(rule?.message).toContain("web");
	});

	test("container_restart clears when all below threshold", () => {
		const results = evaluateTier2Rules(
			makePayload({
				docker: {
					installed: true,
					version: "24.0",
					containers: [
						{
							id: "a",
							name: "web",
							image: "nginx",
							status: "Up",
							state: "running",
							cpu_pct: null,
							mem_bytes: null,
							restart_count: 3,
							started_at: null,
						},
					],
					images: null,
				},
			}),
		);
		const rule = results.find((r) => r.ruleId === "container_restart");
		expect(rule?.fired).toBe(false);
	});

	test("systemd_failed fires when failed_count > 0", () => {
		const results = evaluateTier2Rules(
			makePayload({
				systemd: {
					failed_count: 2,
					failed: [
						{
							unit: "nginx.service",
							load_state: "loaded",
							active_state: "failed",
							sub_state: "failed",
							description: "nginx",
						},
						{
							unit: "foo.service",
							load_state: "loaded",
							active_state: "failed",
							sub_state: "failed",
							description: "foo",
						},
					],
				},
			}),
		);
		const rule = results.find((r) => r.ruleId === "systemd_failed");
		expect(rule?.fired).toBe(true);
		expect(rule?.severity).toBe("warning");
		expect(rule?.value).toBe(2);
	});

	test("systemd_failed clears when failed_count is 0", () => {
		const results = evaluateTier2Rules(
			makePayload({
				systemd: { failed_count: 0, failed: [] },
			}),
		);
		const rule = results.find((r) => r.ruleId === "systemd_failed");
		expect(rule?.fired).toBe(false);
	});

	test("missing sections produce no rules for those sections", () => {
		const results = evaluateTier2Rules(makePayload());
		// No security, ports, systemd, docker data → no rules
		expect(results.length).toBe(0);
	});
});

describe("evaluateTier2Alerts (DB integration)", () => {
	let db: D1Database;

	beforeEach(async () => {
		db = createMockD1();
		// Seed a host
		const now = Math.floor(Date.now() / 1000);
		await db
			.prepare("INSERT INTO hosts (host_id, hostname, last_seen) VALUES (?, ?, ?)")
			.bind("host-001", "host-001", now)
			.run();
	});

	test("instant rule creates alert_states on fire", async () => {
		const now = Math.floor(Date.now() / 1000);
		await evaluateTier2Alerts(
			db,
			"host-001",
			makePayload({
				security: {
					ssh_password_auth: true,
					ssh_root_login: null,
					ssh_failed_logins_7d: null,
					firewall_active: null,
					firewall_default_policy: null,
					fail2ban_active: null,
					fail2ban_banned_count: null,
					unattended_upgrades_active: null,
				},
			}),
			now,
		);

		const alert = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind("host-001", "ssh_password_auth")
			.first<{ severity: string; message: string }>();
		expect(alert).not.toBeNull();
		expect(alert?.severity).toBe("critical");
		expect(alert?.message).toContain("SSH password");
	});

	test("instant rule clears alert_states when resolved", async () => {
		const now = Math.floor(Date.now() / 1000);

		// First: fire
		await evaluateTier2Alerts(
			db,
			"host-001",
			makePayload({
				security: {
					ssh_password_auth: true,
					ssh_root_login: null,
					ssh_failed_logins_7d: null,
					firewall_active: null,
					firewall_default_policy: null,
					fail2ban_active: null,
					fail2ban_banned_count: null,
					unattended_upgrades_active: null,
				},
			}),
			now,
		);

		// Then: clear
		await evaluateTier2Alerts(
			db,
			"host-001",
			makePayload({
				security: {
					ssh_password_auth: false,
					ssh_root_login: null,
					ssh_failed_logins_7d: null,
					firewall_active: null,
					firewall_default_policy: null,
					fail2ban_active: null,
					fail2ban_banned_count: null,
					unattended_upgrades_active: null,
				},
			}),
			now + 3600,
		);

		const alert = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind("host-001", "ssh_password_auth")
			.first();
		expect(alert).toBeNull();
	});

	test("per-host port allowlist suppresses public_port firing", async () => {
		const now = Math.floor(Date.now() / 1000);
		// Add a per-host allowlist entry for 3306
		await db
			.prepare("INSERT INTO port_allowlist (host_id, port) VALUES (?, ?)")
			.bind("host-001", 3306)
			.run();

		await evaluateTier2Alerts(
			db,
			"host-001",
			makePayload({
				ports: {
					listening: [{ port: 3306, bind: "0.0.0.0", protocol: "tcp", pid: 1, process: "mysql" }],
				},
			}),
			now,
		);

		const alert = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind("host-001", "public_port")
			.first();
		expect(alert).toBeNull();
	});
});

// All shipped Tier-2 rules are instant (durationSeconds: 0), so the
// duration branch in handleDurationRule is currently dead code in production.
// These tests pin its state-machine behavior so adding a real duration rule
// later doesn't break silently.
describe("handleDurationRule (duration-based state machine)", () => {
	let db: D1Database;
	const RULE: Omit<AlertEvalResult, "fired" | "value"> = {
		ruleId: "synthetic_duration_rule",
		severity: "warning",
		message: "synthetic",
		durationSeconds: 600, // 10 minutes
	};

	beforeEach(async () => {
		db = createMockD1();
		const now = Math.floor(Date.now() / 1000);
		await db
			.prepare("INSERT INTO hosts (host_id, hostname, last_seen) VALUES (?, ?, ?)")
			.bind("host-001", "host-001", now)
			.run();
	});

	test("first fire writes alert_pending, no alert_states yet", async () => {
		const t0 = 1_000_000;
		await handleDurationRule(db, "host-001", { ...RULE, fired: true, value: 1 }, t0);

		const pending = await db
			.prepare("SELECT first_seen, last_value FROM alert_pending WHERE host_id = ? AND rule_id = ?")
			.bind("host-001", RULE.ruleId)
			.first<{ first_seen: number; last_value: number }>();
		expect(pending).toEqual({ first_seen: t0, last_value: 1 });

		const state = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind("host-001", RULE.ruleId)
			.first();
		expect(state).toBeNull();
	});

	test("subsequent fire before duration elapses keeps pending, updates last_value, no state yet", async () => {
		const t0 = 1_000_000;
		await handleDurationRule(db, "host-001", { ...RULE, fired: true, value: 1 }, t0);
		await handleDurationRule(db, "host-001", { ...RULE, fired: true, value: 7 }, t0 + 60);

		const pending = await db
			.prepare("SELECT first_seen, last_value FROM alert_pending WHERE host_id = ? AND rule_id = ?")
			.bind("host-001", RULE.ruleId)
			.first<{ first_seen: number; last_value: number }>();
		// first_seen unchanged, last_value updated
		expect(pending).toEqual({ first_seen: t0, last_value: 7 });

		const state = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind("host-001", RULE.ruleId)
			.first();
		expect(state).toBeNull();
	});

	test("fire after duration elapses promotes to alert_states", async () => {
		const t0 = 1_000_000;
		await handleDurationRule(db, "host-001", { ...RULE, fired: true, value: 1 }, t0);
		await handleDurationRule(
			db,
			"host-001",
			{ ...RULE, fired: true, value: 9 },
			t0 + RULE.durationSeconds,
		);

		const state = await db
			.prepare(
				"SELECT severity, value, message FROM alert_states WHERE host_id = ? AND rule_id = ?",
			)
			.bind("host-001", RULE.ruleId)
			.first<{ severity: string; value: number; message: string }>();
		expect(state).toEqual({ severity: "warning", value: 9, message: "synthetic" });
	});

	test("clear (fired=false) wipes both alert_pending and alert_states", async () => {
		const t0 = 1_000_000;
		await handleDurationRule(db, "host-001", { ...RULE, fired: true, value: 1 }, t0);
		await handleDurationRule(
			db,
			"host-001",
			{ ...RULE, fired: true, value: 9 },
			t0 + RULE.durationSeconds,
		);

		// Now condition recovers
		await handleDurationRule(
			db,
			"host-001",
			{ ...RULE, fired: false, value: 0 },
			t0 + RULE.durationSeconds + 1,
		);

		const pending = await db
			.prepare("SELECT 1 FROM alert_pending WHERE host_id = ? AND rule_id = ?")
			.bind("host-001", RULE.ruleId)
			.first();
		expect(pending).toBeNull();

		const state = await db
			.prepare("SELECT 1 FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind("host-001", RULE.ruleId)
			.first();
		expect(state).toBeNull();
	});

	test("clear without prior pending is a no-op (idempotent)", async () => {
		await expect(
			handleDurationRule(db, "host-001", { ...RULE, fired: false, value: 0 }, 1_000_000),
		).resolves.toBeUndefined();
	});
});
