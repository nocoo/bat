import { describe, expect, test } from "bun:test";
import { extractNetRates, extractRootDiskPct, safeParse } from "./json-helpers";

describe("safeParse", () => {
	test("returns null on null/empty input", () => {
		expect(safeParse(null)).toBeNull();
		expect(safeParse("")).toBeNull();
	});

	test("returns null on malformed JSON", () => {
		expect(safeParse<unknown>("{")).toBeNull();
		expect(safeParse<unknown>("not json")).toBeNull();
	});

	test("returns the parsed value on valid JSON", () => {
		expect(safeParse<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
		expect(safeParse<number[]>("[1,2,3]")).toEqual([1, 2, 3]);
	});
});

describe("extractRootDiskPct", () => {
	test("returns null when input is null/invalid", () => {
		expect(extractRootDiskPct(null)).toBeNull();
		expect(extractRootDiskPct("garbage")).toBeNull();
	});

	test("returns null when there is no root mount", () => {
		expect(
			extractRootDiskPct(JSON.stringify([{ mount: "/data", used_pct: 50 }])),
		).toBeNull();
	});

	test("returns the root mount's used_pct", () => {
		expect(
			extractRootDiskPct(
				JSON.stringify([
					{ mount: "/data", used_pct: 50 },
					{ mount: "/", used_pct: 73 },
				]),
			),
		).toBe(73);
	});

	test("returns null when used_pct is missing on root", () => {
		expect(
			extractRootDiskPct(JSON.stringify([{ mount: "/" }])),
		).toBeNull();
	});
});

describe("extractNetRates", () => {
	test("returns {null,null} on empty/invalid input", () => {
		expect(extractNetRates(null)).toEqual({ rx: null, tx: null });
		expect(extractNetRates("oops")).toEqual({ rx: null, tx: null });
	});

	test("sums rx_bytes / tx_bytes across interfaces", () => {
		const json = JSON.stringify([
			{ rx_bytes: 100, tx_bytes: 50 },
			{ rx_bytes: 25, tx_bytes: 5 },
		]);
		expect(extractNetRates(json)).toEqual({ rx: 125, tx: 55 });
	});

	test("treats nullish rx/tx as 0", () => {
		const json = JSON.stringify([{ rx_bytes: 10 }, { tx_bytes: 7 }]);
		expect(extractNetRates(json)).toEqual({ rx: 10, tx: 7 });
	});
});
