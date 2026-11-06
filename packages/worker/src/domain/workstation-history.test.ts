import { describe, expect, test } from "vitest";
import {
	machineOrigin,
	observedPublicIp,
	parseHistoryQuery,
	rateLimit,
	rttSummary,
} from "./workstation-history.js";

const NOW = 1_700_000_000;

describe("parseHistoryQuery", () => {
	test("defaults to the last day, 100 points, first page", () => {
		expect(parseHistoryQuery({}, NOW)).toEqual({
			from: NOW - 86_400,
			to: NOW,
			limit: 100,
			offset: 0,
		});
	});

	test("accepts an explicit bounded window", () => {
		expect(
			parseHistoryQuery({ from: "1700000000", to: "1700086400", limit: "10", offset: "5" }, NOW),
		).toEqual({ from: 1_700_000_000, to: 1_700_086_400, limit: 10, offset: 5 });
	});

	test("accepts the 30 day window ceiling", () => {
		expect(
			parseHistoryQuery({ from: String(NOW - 2_592_000), to: String(NOW) }, NOW),
		).toMatchObject({ from: NOW - 2_592_000, to: NOW });
	});

	test.each([
		["negative from", { from: "-1" }],
		["fractional to", { to: "1.5" }],
		["reversed window", { from: "1700086401", to: "1700000000" }],
		["window over 30 days", { from: String(NOW - 2_592_001), to: String(NOW) }],
		["limit zero", { limit: "0" }],
		["limit over 100", { limit: "101" }],
		["fractional limit", { limit: "1.5" }],
		["negative offset", { offset: "-1" }],
		["non-numeric offset", { offset: "next" }],
	])("rejects %s", (_name, params) => {
		expect(parseHistoryQuery(params, NOW)).toBeNull();
	});
});

describe("rttSummary", () => {
	test("summarizes answered probes including genuine zeros", () => {
		expect(rttSummary([10, 0, 20])).toEqual({ avg: 10, min: 0, max: 20 });
	});

	test("returns nulls when nothing answered", () => {
		expect(rttSummary([null, null, null])).toEqual({ avg: null, min: null, max: null });
		expect(rttSummary([])).toEqual({ avg: null, min: null, max: null });
	});

	test("ignores unavailable entries in the average", () => {
		expect(rttSummary([4, null, 6])).toEqual({ avg: 5, min: 4, max: 6 });
	});
});

describe("rateLimit", () => {
	test("uses the fallback in production regardless of the override", () => {
		expect(rateLimit("production", "9000", 2)).toBe(2);
	});

	test("honours a positive integer override outside production", () => {
		expect(rateLimit("development", "9000", 2)).toBe(9000);
		expect(rateLimit(undefined, "3", 2)).toBe(3);
	});

	test("ignores invalid overrides", () => {
		expect(rateLimit("development", undefined, 2)).toBe(2);
		expect(rateLimit("development", "0", 2)).toBe(2);
		expect(rateLimit("development", "-5", 2)).toBe(2);
		expect(rateLimit("development", "1.5", 2)).toBe(2);
		expect(rateLimit("development", "many", 2)).toBe(2);
	});
});

describe("observedPublicIp", () => {
	test("only trusts the platform address in production", () => {
		expect(observedPublicIp("production", "8.8.8.8")).toBe("8.8.8.8");
		expect(observedPublicIp("production", "2001:4860:4860::8888")).toBe("2001:4860:4860::8888");
	});

	test("never records a private, invalid or dev address", () => {
		expect(observedPublicIp("production", "10.0.0.5")).toBeNull();
		expect(observedPublicIp("production", "not-an-ip")).toBeNull();
		expect(observedPublicIp("production", null)).toBeNull();
		expect(observedPublicIp("development", "8.8.8.8")).toBeNull();
		expect(observedPublicIp(undefined, "8.8.8.8")).toBeNull();
	});
});

describe("machineOrigin", () => {
	test("uses the ingestion hostname in production", () => {
		expect(machineOrigin("production", "https://bat.hexly.ai")).toBe(
			"https://bat-ingest.worker.hexly.ai",
		);
	});

	test("keeps the local origin elsewhere", () => {
		expect(machineOrigin("development", "http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
	});
});
