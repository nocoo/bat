// Unit tests for the pure avg/max/min (+ nullable variants) used by the
// hourly aggregation service. Previously covered only indirectly via the
// 641-line integration test; direct tests make their semantics explicit.

import { describe, expect, test } from "bun:test";
import {
	avg,
	avgNullable,
	max,
	maxNullable,
	min,
	sumNullable,
} from "./aggregation";

describe("avg/max/min (non-nullable)", () => {
	test("return 0 on empty input (defensive default)", () => {
		expect(avg([])).toBe(0);
		expect(max([])).toBe(0);
		expect(min([])).toBe(0);
	});

	test("compute correct mean/min/max on a typical range", () => {
		const xs = [10, 20, 30];
		expect(avg(xs)).toBe(20);
		expect(max(xs)).toBe(30);
		expect(min(xs)).toBe(10);
	});

	test("handle negative and zero values", () => {
		expect(avg([-5, 0, 5])).toBe(0);
		expect(max([-5, 0, 5])).toBe(5);
		expect(min([-5, 0, 5])).toBe(-5);
	});

	test("single-element input", () => {
		expect(avg([42])).toBe(42);
		expect(max([42])).toBe(42);
		expect(min([42])).toBe(42);
	});
});

describe("avgNullable", () => {
	test("returns null when all values are null", () => {
		expect(avgNullable([null, null, null])).toBeNull();
		expect(avgNullable([])).toBeNull();
	});

	test("ignores null values when computing the mean", () => {
		expect(avgNullable([10, null, 20, null, 30])).toBe(20);
	});

	test("treats 0 as a real value (not nullish)", () => {
		expect(avgNullable([0, 0, null])).toBe(0);
	});
});

describe("maxNullable", () => {
	test("returns null when all values are null", () => {
		expect(maxNullable([null, null])).toBeNull();
	});

	test("ignores nulls when computing max", () => {
		expect(maxNullable([null, 5, null, 42, 1])).toBe(42);
	});
});

describe("sumNullable", () => {
	test("returns null when all values are null", () => {
		expect(sumNullable([null, null])).toBeNull();
		expect(sumNullable([])).toBeNull();
	});

	test("skips nulls when summing", () => {
		expect(sumNullable([1, null, 2, 3, null])).toBe(6);
	});

	test("preserves 0 contributions", () => {
		expect(sumNullable([0, 0, null])).toBe(0);
	});
});
