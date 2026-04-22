import { describe, expect, test } from "bun:test";
import { buildSparklinesByHost, normalizeNetSparkline, type SparklineRow } from "./hosts";

describe("normalizeNetSparkline", () => {
	test("returns null for an empty input", () => {
		expect(normalizeNetSparkline([])).toBeNull();
	});

	test("scales the max value to 100 and others proportionally", () => {
		const out = normalizeNetSparkline([
			{ ts: 1, v: 50 },
			{ ts: 2, v: 200 },
			{ ts: 3, v: 100 },
		]);
		expect(out).toEqual([
			{ ts: 1, v: 25 },
			{ ts: 2, v: 100 },
			{ ts: 3, v: 50 },
		]);
	});

	test("emits all zeros when every sample is zero", () => {
		const out = normalizeNetSparkline([
			{ ts: 1, v: 0 },
			{ ts: 2, v: 0 },
		]);
		expect(out).toEqual([
			{ ts: 1, v: 0 },
			{ ts: 2, v: 0 },
		]);
	});

	test("preserves timestamps verbatim", () => {
		const out = normalizeNetSparkline([
			{ ts: 1_700_000_000, v: 1 },
			{ ts: 1_700_000_060, v: 2 },
		]);
		expect(out?.map((p) => p.ts)).toEqual([1_700_000_000, 1_700_000_060]);
	});

	test("single-point input yields v=100 (max normalizes to itself)", () => {
		expect(normalizeNetSparkline([{ ts: 5, v: 42 }])).toEqual([{ ts: 5, v: 100 }]);
	});

	test("does not mutate the input array", () => {
		const input = [{ ts: 1, v: 10 }];
		normalizeNetSparkline(input);
		expect(input).toEqual([{ ts: 1, v: 10 }]);
	});
});

describe("buildSparklinesByHost", () => {
	const row = (
		host_id: string,
		ts: number,
		cpu: number | null = null,
		mem: number | null = null,
		net: number | null = null,
	): SparklineRow => ({ host_id, ts, cpu, mem, net });

	test("returns an empty map for no rows", () => {
		expect(buildSparklinesByHost([]).size).toBe(0);
	});

	test("groups samples per host and per channel", () => {
		const map = buildSparklinesByHost([
			row("web", 1, 10, 20, 300),
			row("web", 2, 15, 25, 400),
			row("db", 1, 5, null, null),
		]);
		expect(map.get("web")).toEqual({
			cpu: [{ ts: 1, v: 10 }, { ts: 2, v: 15 }],
			mem: [{ ts: 1, v: 20 }, { ts: 2, v: 25 }],
			net: [{ ts: 1, v: 300 }, { ts: 2, v: 400 }],
		});
		expect(map.get("db")).toEqual({
			cpu: [{ ts: 1, v: 5 }],
			mem: [],
			net: [],
		});
	});

	test("drops per-sample null values instead of pushing them", () => {
		const map = buildSparklinesByHost([
			row("x", 1, null, 10, null),
			row("x", 2, 5, null, null),
		]);
		expect(map.get("x")?.cpu).toEqual([{ ts: 2, v: 5 }]);
		expect(map.get("x")?.mem).toEqual([{ ts: 1, v: 10 }]);
		expect(map.get("x")?.net).toEqual([]);
	});

	test("preserves input order within each host", () => {
		const map = buildSparklinesByHost([
			row("x", 3, 30),
			row("x", 1, 10),
			row("x", 2, 20),
		]);
		expect(map.get("x")?.cpu).toEqual([
			{ ts: 3, v: 30 },
			{ ts: 1, v: 10 },
			{ ts: 2, v: 20 },
		]);
	});

	test("creates an entry per host even if all channels are null", () => {
		// Helper eagerly creates the entry; callers decide whether to use it.
		const map = buildSparklinesByHost([row("ghost", 1, null, null, null)]);
		expect(map.get("ghost")).toEqual({ cpu: [], mem: [], net: [] });
	});
});
