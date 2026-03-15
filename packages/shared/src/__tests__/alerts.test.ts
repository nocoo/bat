import { describe, expect, test } from "bun:test";
import { type AlertSeverity, TIER1_ALERT_RULES, getAlertRule } from "../alerts";
import { ALERT_THRESHOLDS } from "../constants";

describe("TIER1_ALERT_RULES", () => {
	test("contains exactly 6 rules", () => {
		expect(TIER1_ALERT_RULES).toHaveLength(6);
	});

	test("all rule IDs are unique", () => {
		const ids = TIER1_ALERT_RULES.map((r) => r.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test("expected rule IDs are present", () => {
		const ids = TIER1_ALERT_RULES.map((r) => r.id);
		expect(ids).toContain("mem_high");
		expect(ids).toContain("no_swap");
		expect(ids).toContain("disk_full");
		expect(ids).toContain("iowait_high");
		expect(ids).toContain("steal_high");
		expect(ids).toContain("host_offline");
	});

	test("severity values are valid", () => {
		const validSeverities: AlertSeverity[] = ["warning", "critical"];
		for (const rule of TIER1_ALERT_RULES) {
			expect(validSeverities).toContain(rule.severity);
		}
	});

	test("instant rules have duration_seconds = 0", () => {
		const instantRules = ["mem_high", "no_swap", "disk_full", "host_offline"];
		for (const id of instantRules) {
			const rule = TIER1_ALERT_RULES.find((r) => r.id === id);
			expect(rule).toBeDefined();
			expect(rule!.duration_seconds).toBe(0);
		}
	});

	test("duration rules have correct duration_seconds", () => {
		const iowait = TIER1_ALERT_RULES.find((r) => r.id === "iowait_high");
		expect(iowait).toBeDefined();
		expect(iowait!.duration_seconds).toBe(ALERT_THRESHOLDS.IOWAIT_DURATION_SECONDS);
		expect(iowait!.duration_seconds).toBe(300);

		const steal = TIER1_ALERT_RULES.find((r) => r.id === "steal_high");
		expect(steal).toBeDefined();
		expect(steal!.duration_seconds).toBe(ALERT_THRESHOLDS.STEAL_DURATION_SECONDS);
		expect(steal!.duration_seconds).toBe(300);
	});

	test("critical rules are mem_high, no_swap, disk_full, host_offline", () => {
		const criticalRules = TIER1_ALERT_RULES.filter((r) => r.severity === "critical");
		const criticalIds = criticalRules.map((r) => r.id).sort();
		expect(criticalIds).toEqual(["disk_full", "host_offline", "mem_high", "no_swap"]);
	});

	test("warning rules are iowait_high, steal_high", () => {
		const warningRules = TIER1_ALERT_RULES.filter((r) => r.severity === "warning");
		const warningIds = warningRules.map((r) => r.id).sort();
		expect(warningIds).toEqual(["iowait_high", "steal_high"]);
	});
});

describe("getAlertRule", () => {
	test("returns the correct rule for a valid ID", () => {
		const rule = getAlertRule("mem_high");
		expect(rule).toBeDefined();
		expect(rule!.id).toBe("mem_high");
		expect(rule!.severity).toBe("critical");
		expect(rule!.duration_seconds).toBe(0);
	});

	test("returns undefined for an unknown ID", () => {
		const rule = getAlertRule("nonexistent");
		expect(rule).toBeUndefined();
	});

	test("returns correct rule for each valid ID", () => {
		for (const expected of TIER1_ALERT_RULES) {
			const rule = getAlertRule(expected.id);
			expect(rule).toEqual(expected);
		}
	});
});
