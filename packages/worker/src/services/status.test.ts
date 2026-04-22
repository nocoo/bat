import { describe, expect, test } from "bun:test";
import { deriveHostStatus } from "./status";

// UTC anchor: 2026-04-20T18:00:00Z = 1776708000
const NOW = 1776708000;
const FRESH = NOW - 10; // within OFFLINE_SECONDS (120)
const STALE = NOW - 3600; // beyond OFFLINE_SECONDS

describe("deriveHostStatus", () => {
	test("healthy when fresh with no alerts", () => {
		expect(deriveHostStatus(FRESH, NOW, [])).toBe("healthy");
	});

	test("offline when last_seen beyond threshold", () => {
		expect(deriveHostStatus(STALE, NOW, [])).toBe("offline");
	});

	test("critical alert beats warning", () => {
		const status = deriveHostStatus(FRESH, NOW, [
			{ severity: "warning", rule_id: "systemd_failed" },
			{ severity: "critical", rule_id: "no_firewall" },
		]);
		expect(status).toBe("critical");
	});

	test("warning when any warning alert present", () => {
		const status = deriveHostStatus(FRESH, NOW, [
			{ severity: "warning", rule_id: "systemd_failed" },
		]);
		expect(status).toBe("warning");
	});

	test("maintenance window takes precedence over offline", () => {
		// NOW in UTC is 18:00 — window 17:00-19:00 covers it
		const status = deriveHostStatus(
			STALE,
			NOW,
			[{ severity: "critical", rule_id: "no_firewall" }],
			undefined,
			{ start: "17:00", end: "19:00" },
		);
		expect(status).toBe("maintenance");
	});

	test("maintenance object without active window does not override", () => {
		// Window in the future (UTC 20:00-22:00)
		const status = deriveHostStatus(FRESH, NOW, [], undefined, {
			start: "20:00",
			end: "22:00",
		});
		expect(status).toBe("healthy");
	});

	test("null maintenance is ignored", () => {
		expect(deriveHostStatus(FRESH, NOW, [], undefined, null)).toBe("healthy");
	});

	test("public_port warning suppressed when all ports allowlisted", () => {
		const allowed = new Set([80, 443]);
		const status = deriveHostStatus(
			FRESH,
			NOW,
			[
				{
					severity: "warning",
					rule_id: "public_port",
					message: "Unexpected public ports: 80, 443",
				},
			],
			allowed,
		);
		expect(status).toBe("healthy");
	});

	test("public_port warning kept when any port not in allowlist", () => {
		const allowed = new Set([80]);
		const status = deriveHostStatus(
			FRESH,
			NOW,
			[
				{
					severity: "warning",
					rule_id: "public_port",
					message: "Unexpected public ports: 80, 3306",
				},
			],
			allowed,
		);
		expect(status).toBe("warning");
	});

	test("public_port warning kept when message is null (no ports parsed)", () => {
		const allowed = new Set([80]);
		const status = deriveHostStatus(
			FRESH,
			NOW,
			[{ severity: "warning", rule_id: "public_port", message: null }],
			allowed,
		);
		expect(status).toBe("warning");
	});

	test("public_port warning kept when message has no port list match", () => {
		const allowed = new Set([80]);
		const status = deriveHostStatus(
			FRESH,
			NOW,
			[
				{
					severity: "warning",
					rule_id: "public_port",
					message: "something else entirely",
				},
			],
			allowed,
		);
		expect(status).toBe("warning");
	});

	test("public_port warning kept when allowlist is empty set", () => {
		// empty allowedPorts Set → short-circuit skips parsing, still counts as warning
		const status = deriveHostStatus(
			FRESH,
			NOW,
			[
				{
					severity: "warning",
					rule_id: "public_port",
					message: "Unexpected public ports: 80",
				},
			],
			new Set(),
		);
		expect(status).toBe("warning");
	});

	test("non-warning non-critical alerts are filtered out", () => {
		// info severity → hasWarning returns false (covers line 64 false branch)
		const status = deriveHostStatus(FRESH, NOW, [{ severity: "info", rule_id: "something" }]);
		expect(status).toBe("healthy");
	});

	test("parsePublicPorts tolerates garbage tokens in message", () => {
		// Non-numeric tokens are dropped; remaining valid ports checked vs allowlist
		const allowed = new Set([80]);
		const status = deriveHostStatus(
			FRESH,
			NOW,
			[
				{
					severity: "warning",
					rule_id: "public_port",
					message: "Unexpected public ports: 80, abc, -5",
				},
			],
			allowed,
		);
		// Only 80 parses as valid; it's in allowlist → suppressed
		expect(status).toBe("healthy");
	});
});

import { parsePublicPorts } from "./status";

describe("parsePublicPorts", () => {
	test("returns empty for null / undefined / empty messages", () => {
		expect(parsePublicPorts(null)).toEqual([]);
		expect(parsePublicPorts(undefined)).toEqual([]);
		expect(parsePublicPorts("")).toEqual([]);
	});

	test("returns empty when the sentinel prefix is missing", () => {
		expect(parsePublicPorts("Some unrelated alert")).toEqual([]);
		expect(parsePublicPorts("public ports: 80")).toEqual([]);
	});

	test("parses a single port", () => {
		expect(parsePublicPorts("Unexpected public ports: 8080")).toEqual([8080]);
	});

	test("parses a comma-separated list with whitespace", () => {
		expect(parsePublicPorts("Unexpected public ports: 22, 80, 443")).toEqual([22, 80, 443]);
	});

	test("drops tokens that aren't positive integers", () => {
		expect(parsePublicPorts("Unexpected public ports: 80, abc, 0, -5, 443")).toEqual([80, 443]);
	});

	test("drops non-integer numerics (e.g. floats)", () => {
		expect(parsePublicPorts("Unexpected public ports: 80, 8.5, 443")).toEqual([80, 443]);
	});

	test("returns empty when the list after the prefix is blank", () => {
		// Regex requires at least one non-whitespace char after the space; blank → no match
		expect(parsePublicPorts("Unexpected public ports:    ")).toEqual([]);
	});
});
