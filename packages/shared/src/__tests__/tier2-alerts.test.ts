// @bat/shared — Tier 2 alert rules verification
import { describe, expect, test } from "bun:test";
import {
	ALL_ALERT_RULES,
	TIER1_ALERT_RULES,
	TIER2_ALERT_RULES,
	TIER3_ALERT_RULES,
	getAlertRule,
} from "../alerts";

describe("TIER2_ALERT_RULES", () => {
	test("has 9 rules", () => {
		expect(TIER2_ALERT_RULES.length).toBe(9);
	});

	test("all rules have required fields", () => {
		for (const rule of TIER2_ALERT_RULES) {
			expect(typeof rule.id).toBe("string");
			expect(rule.id.length).toBeGreaterThan(0);
			expect(["info", "warning", "critical"]).toContain(rule.severity);
			expect(typeof rule.duration_seconds).toBe("number");
			expect(rule.duration_seconds).toBeGreaterThanOrEqual(0);
		}
	});

	test("rule IDs are unique", () => {
		const ids = TIER2_ALERT_RULES.map((r) => r.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test("no overlap with Tier 1 IDs", () => {
		const tier1Ids = new Set(TIER1_ALERT_RULES.map((r) => r.id));
		for (const rule of TIER2_ALERT_RULES) {
			expect(tier1Ids.has(rule.id)).toBe(false);
		}
	});

	test("uptime_anomaly is info, instant", () => {
		const rule = TIER2_ALERT_RULES.find((r) => r.id === "uptime_anomaly");
		expect(rule?.severity).toBe("info");
		expect(rule?.duration_seconds).toBe(0);
	});

	test("ssh_password_auth is critical, instant", () => {
		const rule = TIER2_ALERT_RULES.find((r) => r.id === "ssh_password_auth");
		expect(rule?.severity).toBe("critical");
		expect(rule?.duration_seconds).toBe(0);
	});

	test("ssh_root_login is critical, instant", () => {
		const rule = TIER2_ALERT_RULES.find((r) => r.id === "ssh_root_login");
		expect(rule?.severity).toBe("critical");
		expect(rule?.duration_seconds).toBe(0);
	});

	test("no_firewall is critical, instant", () => {
		const rule = TIER2_ALERT_RULES.find((r) => r.id === "no_firewall");
		expect(rule?.severity).toBe("critical");
		expect(rule?.duration_seconds).toBe(0);
	});

	test("public_port is warning, instant", () => {
		const rule = TIER2_ALERT_RULES.find((r) => r.id === "public_port");
		expect(rule?.severity).toBe("warning");
		expect(rule?.duration_seconds).toBe(0);
	});

	test("security_updates is warning, 7d duration", () => {
		const rule = TIER2_ALERT_RULES.find((r) => r.id === "security_updates");
		expect(rule?.severity).toBe("warning");
		expect(rule?.duration_seconds).toBe(604800);
	});

	test("container_restart is critical, instant", () => {
		const rule = TIER2_ALERT_RULES.find((r) => r.id === "container_restart");
		expect(rule?.severity).toBe("critical");
		expect(rule?.duration_seconds).toBe(0);
	});

	test("systemd_failed is warning, instant", () => {
		const rule = TIER2_ALERT_RULES.find((r) => r.id === "systemd_failed");
		expect(rule?.severity).toBe("warning");
		expect(rule?.duration_seconds).toBe(0);
	});

	test("reboot_required is info, 7d duration", () => {
		const rule = TIER2_ALERT_RULES.find((r) => r.id === "reboot_required");
		expect(rule?.severity).toBe("info");
		expect(rule?.duration_seconds).toBe(604800);
	});
});

describe("ALL_ALERT_RULES", () => {
	test("contains all Tier 1 + Tier 2 + Tier 3 rules", () => {
		expect(ALL_ALERT_RULES.length).toBe(
			TIER1_ALERT_RULES.length + TIER2_ALERT_RULES.length + TIER3_ALERT_RULES.length,
		);
	});

	test("all IDs are unique across tiers", () => {
		const ids = ALL_ALERT_RULES.map((r) => r.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test("has exactly 21 rules total", () => {
		expect(ALL_ALERT_RULES.length).toBe(21);
	});
});

describe("getAlertRule (across all tiers)", () => {
	test("finds Tier 1 rule", () => {
		const rule = getAlertRule("mem_high");
		expect(rule).not.toBeUndefined();
		expect(rule?.severity).toBe("critical");
	});

	test("finds Tier 2 rule", () => {
		const rule = getAlertRule("ssh_password_auth");
		expect(rule).not.toBeUndefined();
		expect(rule?.severity).toBe("critical");
	});

	test("returns undefined for unknown rule", () => {
		expect(getAlertRule("nonexistent")).toBeUndefined();
	});
});
