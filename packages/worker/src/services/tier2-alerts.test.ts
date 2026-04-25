import { beforeEach, describe, expect, test } from "vitest";
import type { Tier2Payload } from "@bat/shared";
import { createMockD1 } from "../test-helpers/mock-d1";
import { evaluateTier2Alerts, evaluateTier2Rules } from "./tier2-alerts";

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
