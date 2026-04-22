import { describe, expect, test } from "bun:test";
import {
	chart,
	chartAxis,
	chartMuted,
	getBadgeStyle,
	getBadgeStyleByIndex,
	getSwatchColor,
	PALETTE_SIZE,
} from "./palette";

describe("chart palette", () => {
	test("contains all 10 named chart tokens", () => {
		expect(Object.keys(chart)).toHaveLength(10);
		for (const value of Object.values(chart)) {
			expect(value).toMatch(/^hsl\(var\(--chart-\d+\)\)$/);
		}
	});

	test("axis and muted are CSS vars", () => {
		expect(chartAxis).toBe("hsl(var(--chart-axis))");
		expect(chartMuted).toBe("hsl(var(--chart-muted))");
	});
});

describe("PALETTE_SIZE", () => {
	test("is 10", () => {
		expect(PALETTE_SIZE).toBe(10);
	});
});

describe("getBadgeStyleByIndex", () => {
	test("wraps with modulo for positive overflow", () => {
		expect(getBadgeStyleByIndex(10)).toEqual(getBadgeStyleByIndex(0));
		expect(getBadgeStyleByIndex(11)).toEqual(getBadgeStyleByIndex(1));
	});

	test("wraps correctly for negative indices", () => {
		expect(getBadgeStyleByIndex(-1)).toEqual(getBadgeStyleByIndex(9));
		expect(getBadgeStyleByIndex(-10)).toEqual(getBadgeStyleByIndex(0));
	});

	test("returns the soft-tinted color shape", () => {
		const s = getBadgeStyleByIndex(0);
		expect(s.backgroundColor).toMatch(/^hsl\(var\(--chart-\d+\) \/ 0\.12\)$/);
		expect(s.color).toMatch(/^hsl\(var\(--chart-\d+\)\)$/);
	});
});

describe("getBadgeStyle (hash-based)", () => {
	test("is deterministic", () => {
		expect(getBadgeStyle("alpha")).toEqual(getBadgeStyle("alpha"));
		expect(getBadgeStyle("中文")).toEqual(getBadgeStyle("中文"));
	});

	test("empty string still returns valid shape", () => {
		const s = getBadgeStyle("");
		expect(s.backgroundColor).toContain("hsl(var(--chart-");
		expect(s.color).toContain("hsl(var(--chart-");
	});

	test("different inputs may map to different colors but always to a valid token", () => {
		for (const text of ["a", "b", "host-1", "production", "中文"]) {
			const s = getBadgeStyle(text);
			expect(s.backgroundColor).toMatch(/--chart-\d+\) \/ 0\.12/);
		}
	});
});

describe("getSwatchColor", () => {
	test("returns a solid hsl with no alpha", () => {
		expect(getSwatchColor(0)).toMatch(/^hsl\(var\(--chart-\d+\)\)$/);
	});

	test("wraps around for out-of-range indices", () => {
		expect(getSwatchColor(10)).toBe(getSwatchColor(0));
		expect(getSwatchColor(-1)).toBe(getSwatchColor(9));
	});
});
