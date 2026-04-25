// Unit tests for pure ext_json expansion helpers in metrics route.
import { describe, expect, test } from "vitest";
import {
	EXT_KEY_MAP,
	type HourlyRow,
	type RawRow,
	expandHourlyRow,
	expandRawRow,
	parseMetricsRange,
} from "./metrics.js";

describe("expandRawRow", () => {
	test("copies base columns when ext_json is null", () => {
		const row: RawRow = { ts: 1000, cpu_usage_pct: 42, ext_json: null };
		const out = expandRawRow(row) as unknown as Record<string, unknown>;
		expect(out.ts).toBe(1000);
		expect(out.cpu_usage_pct).toBe(42);
		expect("ext_json" in out).toBe(false);
	});

	test("unpacks ext_json entries directly onto the data point", () => {
		const row: RawRow = {
			ts: 2000,
			ext_json: JSON.stringify({ interrupts_sec: 99, conntrack_count: 7 }),
		};
		const out = expandRawRow(row) as unknown as Record<string, unknown>;
		expect(out.interrupts_sec).toBe(99);
		expect(out.conntrack_count).toBe(7);
	});

	test("tolerates malformed ext_json without throwing", () => {
		const row: RawRow = { ts: 3000, ext_json: "{bad json" };
		const out = expandRawRow(row) as unknown as Record<string, unknown>;
		expect(out.ts).toBe(3000);
		expect(out.interrupts_sec).toBeUndefined();
	});

	test("preserves explicit null values in ext_json", () => {
		const row: RawRow = { ts: 4000, ext_json: JSON.stringify({ interrupts_sec: null }) };
		const out = expandRawRow(row) as unknown as Record<string, unknown>;
		expect(out.interrupts_sec).toBeNull();
	});
});

describe("expandHourlyRow", () => {
	test("initialises all EXT_KEY_MAP target fields to null when ext_json missing", () => {
		const row: HourlyRow = { ts: 1000, ext_json: null };
		const out = expandHourlyRow(row) as unknown as Record<string, unknown>;
		for (const target of Object.values(EXT_KEY_MAP)) {
			expect(out[target]).toBeNull();
		}
		expect("ext_json" in out).toBe(false);
	});

	test("maps ext_json keys via EXT_KEY_MAP to their data-point field names", () => {
		const row: HourlyRow = {
			ts: 2000,
			ext_json: JSON.stringify({
				interrupts_sec_avg: 12,
				conntrack_max: 4096,
				psi_cpu_some_total_delta_sum: 3.5,
			}),
		};
		const out = expandHourlyRow(row) as unknown as Record<string, unknown>;
		expect(out.interrupts_sec).toBe(12);
		expect(out.conntrack_max).toBe(4096);
		expect(out.psi_cpu_some_total_delta).toBe(3.5);
		// Unspecified keys remain null
		expect(out.tasks_running).toBeNull();
	});

	test("ignores unknown ext_json keys that aren't in EXT_KEY_MAP", () => {
		const row: HourlyRow = { ts: 3000, ext_json: JSON.stringify({ unknown_key: 123 }) };
		const out = expandHourlyRow(row) as unknown as Record<string, unknown>;
		expect(out.unknown_key).toBeUndefined();
	});

	test("preserves base columns alongside unpacked ext fields", () => {
		const row: HourlyRow = {
			ts: 4000,
			cpu_usage_pct: 55,
			ext_json: JSON.stringify({ tasks_running_avg: 8 }),
		};
		const out = expandHourlyRow(row) as unknown as Record<string, unknown>;
		expect(out.ts).toBe(4000);
		expect(out.cpu_usage_pct).toBe(55);
		expect(out.tasks_running).toBe(8);
	});

	test("tolerates malformed ext_json and keeps all ext fields null", () => {
		const row: HourlyRow = { ts: 5000, ext_json: "not json" };
		const out = expandHourlyRow(row) as unknown as Record<string, unknown>;
		for (const target of Object.values(EXT_KEY_MAP)) {
			expect(out[target]).toBeNull();
		}
	});

	test("EXT_KEY_MAP entries produce unique target field names", () => {
		const targets = Object.values(EXT_KEY_MAP);
		expect(new Set(targets).size).toBe(targets.length);
	});

	test("handles undefined ext_json entries (leaves mapped field as null)", () => {
		const row: HourlyRow = {
			ts: 6000,
			ext_json: JSON.stringify({ interrupts_sec_avg: undefined }),
		};
		const out = expandHourlyRow(row) as unknown as Record<string, unknown>;
		expect(out.interrupts_sec).toBeNull();
	});
});

describe("parseMetricsRange", () => {
	test("returns numeric from/to when both params are valid", () => {
		expect(parseMetricsRange("100", "200")).toEqual({ ok: true, from: 100, to: 200 });
	});

	test("rejects when either param is missing", () => {
		expect(parseMetricsRange(undefined, "200")).toMatchObject({ ok: false });
		expect(parseMetricsRange("100", undefined)).toMatchObject({ ok: false });
		expect(parseMetricsRange(undefined, undefined)).toMatchObject({ ok: false });
	});

	test("rejects when either param isn't a valid number", () => {
		expect(parseMetricsRange("abc", "200")).toMatchObject({ ok: false });
		expect(parseMetricsRange("100", "xyz")).toMatchObject({ ok: false });
	});

	test("accepts floats and negatives (range math can still compute)", () => {
		expect(parseMetricsRange("-10", "10.5")).toEqual({ ok: true, from: -10, to: 10.5 });
	});

	test("returns distinct error messages for missing vs non-numeric", () => {
		const missing = parseMetricsRange("", "");
		const nonNum = parseMetricsRange("a", "b");
		expect(missing.ok).toBe(false);
		expect(nonNum.ok).toBe(false);
		if (!(missing.ok || nonNum.ok)) {
			expect(missing.error).not.toBe(nonNum.error);
		}
	});
});
