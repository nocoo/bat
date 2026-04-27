import type { AlertItem } from "@bat/shared";
import { describe, expect, test } from "vitest";
import { formatRelativeTime, severityColorClass, sortAlertsBySeverity } from "./alerts-format";

const a = (severity: AlertItem["severity"], triggered_at: number, rule_id = "r"): AlertItem => ({
	hid: "h",
	host_id: "host",
	hostname: "host",
	rule_id,
	severity,
	value: null,
	triggered_at,
	message: null,
});

describe("severityColorClass", () => {
	test("critical → destructive", () => {
		expect(severityColorClass("critical")).toBe("text-destructive");
	});
	test("warning → warning", () => {
		expect(severityColorClass("warning")).toBe("text-warning");
	});
	test("info → muted", () => {
		expect(severityColorClass("info")).toBe("text-muted-foreground");
	});
});

describe("sortAlertsBySeverity", () => {
	test("critical before warning before info", () => {
		const out = sortAlertsBySeverity([a("info", 100), a("critical", 100), a("warning", 100)]);
		expect(out.map((x) => x.severity)).toEqual(["critical", "warning", "info"]);
	});
	test("within same severity, most recent first", () => {
		const out = sortAlertsBySeverity([a("warning", 100, "old"), a("warning", 200, "new")]);
		expect(out.map((x) => x.rule_id)).toEqual(["new", "old"]);
	});
	test("does not mutate input", () => {
		const input = [a("info", 100), a("critical", 100)];
		const ref = [...input];
		sortAlertsBySeverity(input);
		expect(input).toEqual(ref);
	});
	test("empty → empty", () => {
		expect(sortAlertsBySeverity([])).toEqual([]);
	});
});

describe("formatRelativeTime", () => {
	const now = 1_700_000_000;
	test("under a minute → just now", () => {
		expect(formatRelativeTime(now - 30, now)).toBe("just now");
		expect(formatRelativeTime(now, now)).toBe("just now");
	});
	test("minutes", () => {
		expect(formatRelativeTime(now - 5 * 60, now)).toBe("5m ago");
		expect(formatRelativeTime(now - 59 * 60, now)).toBe("59m ago");
	});
	test("hours", () => {
		expect(formatRelativeTime(now - 2 * 3600, now)).toBe("2h ago");
		expect(formatRelativeTime(now - 23 * 3600, now)).toBe("23h ago");
	});
	test("days", () => {
		expect(formatRelativeTime(now - 3 * 86400, now)).toBe("3d ago");
	});
	test("future (clock skew) clamps to just now", () => {
		expect(formatRelativeTime(now + 100, now)).toBe("just now");
	});
});
