// Tests for pure map-builders + formatAlerts + worstTier in monitoring.ts.
// These helpers were untested before — split into their own sibling test file
// so the existing monitoring.test.ts (HTTP-level integration) stays focused.

import type { HostStatus } from "@bat/shared";
import { describe, expect, test } from "vitest";
import { type AlertRow, buildAlertsByHost, formatAlerts, worstTier } from "./monitoring";

const alert = (over: Partial<AlertRow>): AlertRow => ({
	host_id: "h",
	severity: "warning",
	rule_id: "r",
	message: null,
	value: null,
	triggered_at: 0,
	...over,
});

describe("buildAlertsByHost", () => {
	test("groups multiple alerts by host_id", () => {
		const rows = [
			alert({ host_id: "a", rule_id: "r1" }),
			alert({ host_id: "b" }),
			alert({ host_id: "a", rule_id: "r2" }),
		];
		const m = buildAlertsByHost(rows);
		expect(m.size).toBe(2);
		expect(m.get("a")?.map((a) => a.rule_id)).toEqual(["r1", "r2"]);
		expect(m.get("b")).toHaveLength(1);
	});

	test("returns empty map for empty input", () => {
		expect(buildAlertsByHost([]).size).toBe(0);
	});
});

describe("formatAlerts", () => {
	test("maps rows to minimal response shape (drops host_id)", () => {
		const rows = [
			alert({
				host_id: "ignored",
				rule_id: "cpu_high",
				severity: "critical",
				value: 95,
				message: "hot",
				triggered_at: 1700,
			}),
		];
		expect(formatAlerts(rows)).toEqual([
			{
				rule_id: "cpu_high",
				severity: "critical",
				value: 95,
				message: "hot",
				triggered_at: 1700,
			},
		]);
	});

	test("empty input → empty array", () => {
		expect(formatAlerts([])).toEqual([]);
	});
});

describe("worstTier", () => {
	const worse = (a: HostStatus, b: HostStatus): HostStatus => worstTier(a, b);

	test("offline > critical > warning > healthy", () => {
		expect(worse("offline", "critical")).toBe("offline");
		expect(worse("critical", "warning")).toBe("critical");
		expect(worse("warning", "healthy")).toBe("warning");
	});

	test("ties return the first argument (stable)", () => {
		expect(worse("warning", "warning")).toBe("warning");
	});

	test("unknown tier is treated as healthy (priority 0)", () => {
		expect(worse("warning", "bogus" as unknown as HostStatus)).toBe("warning");
	});
});

import { buildMonitoringAlertsResult, type MonitoringAlertRow } from "./monitoring";

const mAlert = (over: Partial<MonitoringAlertRow>): MonitoringAlertRow => ({
	host_id: "h1",
	hostname: "h1.example",
	rule_id: "cpu",
	severity: "warning",
	value: 50,
	message: null,
	triggered_at: 1000,
	...over,
});

describe("buildMonitoringAlertsResult", () => {
	test("returns empty result for no alerts", () => {
		expect(
			buildMonitoringAlertsResult([], new Map(), { severity: undefined, tags: [] }, 1000),
		).toEqual({
			alert_count: 0,
			by_severity: { critical: 0, warning: 0, info: 0 },
			alerts: [],
		});
	});
	test("counts by severity", () => {
		const alerts = [
			mAlert({ severity: "critical" }),
			mAlert({ severity: "warning" }),
			mAlert({ severity: "warning" }),
			mAlert({ severity: "info" }),
		];
		const r = buildMonitoringAlertsResult(
			alerts,
			new Map(),
			{ severity: undefined, tags: [] },
			1000,
		);
		expect(r.by_severity).toEqual({ critical: 1, warning: 2, info: 1 });
		expect(r.alert_count).toBe(4);
	});
	test("ignores unknown severities in counts but still includes items", () => {
		const alerts = [mAlert({ severity: "weird" })];
		const r = buildMonitoringAlertsResult(
			alerts,
			new Map(),
			{ severity: undefined, tags: [] },
			1000,
		);
		expect(r.by_severity).toEqual({ critical: 0, warning: 0, info: 0 });
		expect(r.alert_count).toBe(1);
	});
	test("filters by severity", () => {
		const alerts = [mAlert({ severity: "critical" }), mAlert({ severity: "warning" })];
		const r = buildMonitoringAlertsResult(
			alerts,
			new Map(),
			{ severity: "critical", tags: [] },
			1000,
		);
		expect(r.alert_count).toBe(1);
		expect(r.alerts[0]?.severity).toBe("critical");
	});
	test("filters by tag (AND logic)", () => {
		const a = mAlert({ host_id: "h1" });
		const b = mAlert({ host_id: "h2" });
		const tags = new Map([
			["h1", ["prod", "web"]],
			["h2", ["prod"]],
		]);
		const r = buildMonitoringAlertsResult(
			[a, b],
			tags,
			{ severity: undefined, tags: ["prod", "web"] },
			1000,
		);
		expect(r.alert_count).toBe(1);
		expect(r.alerts[0]?.host_id).toBe("h1");
	});
	test("empty tag filter matches all", () => {
		const a = mAlert({ host_id: "h1" });
		const r = buildMonitoringAlertsResult([a], new Map(), { severity: undefined, tags: [] }, 1000);
		expect(r.alert_count).toBe(1);
	});
	test("computes duration_seconds from now", () => {
		const a = mAlert({ triggered_at: 900 });
		const r = buildMonitoringAlertsResult([a], new Map(), { severity: undefined, tags: [] }, 1000);
		expect(r.alerts[0]?.duration_seconds).toBe(100);
	});
	test("attaches host tags to each item", () => {
		const a = mAlert({ host_id: "h1" });
		const tags = new Map([["h1", ["prod"]]]);
		const r = buildMonitoringAlertsResult([a], tags, { severity: undefined, tags: [] }, 1000);
		expect(r.alerts[0]?.tags).toEqual(["prod"]);
	});
	test("item has no tags for hosts absent from map", () => {
		const a = mAlert({ host_id: "missing" });
		const r = buildMonitoringAlertsResult([a], new Map(), { severity: undefined, tags: [] }, 1000);
		expect(r.alerts[0]?.tags).toEqual([]);
	});
});

import { buildTagGroups } from "./monitoring";

describe("buildTagGroups", () => {
	const h = (id: string, hostname = `${id}.ex`) => ({ host_id: id, hostname });

	test("returns empty array when no hosts", () => {
		expect(buildTagGroups([], new Map(), new Map(), new Map())).toEqual([]);
	});
	test("groups untagged hosts into (untagged)", () => {
		const groups = buildTagGroups(
			[h("h1"), h("h2")],
			new Map([
				["h1", "healthy" as HostStatus],
				["h2", "warning" as HostStatus],
			]),
			new Map([
				["h1", 0],
				["h2", 3],
			]),
			new Map(),
		);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.tag).toBe("(untagged)");
		expect(groups[0]?.host_count).toBe(2);
		expect(groups[0]?.alert_count).toBe(3);
		expect(groups[0]?.by_tier).toEqual({
			healthy: 1,
			warning: 1,
			critical: 0,
			offline: 0,
		});
		expect(groups[0]?.tier).toBe("warning");
	});
	test("host with multiple tags appears in each group", () => {
		const groups = buildTagGroups(
			[h("h1")],
			new Map([["h1", "healthy" as HostStatus]]),
			new Map([["h1", 0]]),
			new Map([["h1", ["prod", "web"]]]),
		);
		expect(groups.map((g) => g.tag).sort()).toEqual(["prod", "web"]);
		for (const g of groups) {
			expect(g.host_count).toBe(1);
			expect(g.hosts[0]?.host_id).toBe("h1");
		}
	});
	test("empty tag array falls back to untagged", () => {
		const groups = buildTagGroups(
			[h("h1")],
			new Map([["h1", "healthy" as HostStatus]]),
			new Map([["h1", 0]]),
			new Map([["h1", []]]),
		);
		expect(groups.map((g) => g.tag)).toEqual(["(untagged)"]);
	});
	test("worstTier reflects worst tier across group", () => {
		const groups = buildTagGroups(
			[h("h1"), h("h2"), h("h3")],
			new Map([
				["h1", "healthy" as HostStatus],
				["h2", "critical" as HostStatus],
				["h3", "warning" as HostStatus],
			]),
			new Map([
				["h1", 0],
				["h2", 4],
				["h3", 2],
			]),
			new Map([
				["h1", ["a"]],
				["h2", ["a"]],
				["h3", ["a"]],
			]),
		);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.tier).toBe("critical");
		expect(groups[0]?.alert_count).toBe(6);
	});
	test("missing tier defaults to healthy", () => {
		const groups = buildTagGroups([h("h1")], new Map(), new Map(), new Map([["h1", ["x"]]]));
		expect(groups[0]?.by_tier.healthy).toBe(1);
		expect(groups[0]?.alert_count).toBe(0);
	});
	test("by_tier counts each tier correctly", () => {
		const groups = buildTagGroups(
			[h("a"), h("b"), h("c"), h("d"), h("e")],
			new Map<string, HostStatus>([
				["a", "healthy"],
				["b", "warning"],
				["c", "critical"],
				["d", "offline"],
				["e", "offline"],
			]),
			new Map(),
			new Map([
				["a", ["g"]],
				["b", ["g"]],
				["c", ["g"]],
				["d", ["g"]],
				["e", ["g"]],
			]),
		);
		expect(groups[0]?.by_tier).toEqual({
			healthy: 1,
			warning: 1,
			critical: 1,
			offline: 2,
		});
	});
});
