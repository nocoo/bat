import { describe, expect, it } from "vitest";
import { DEFAULT_RETENTION_DAYS, RETENTION_OPTIONS, parseRetentionDays } from "../settings.js";

describe("settings", () => {
	describe("RETENTION_OPTIONS", () => {
		it("contains exactly [1, 7, 30]", () => {
			expect([...RETENTION_OPTIONS]).toEqual([1, 7, 30]);
		});
	});

	describe("DEFAULT_RETENTION_DAYS", () => {
		it("defaults to 7", () => {
			expect(DEFAULT_RETENTION_DAYS).toBe(7);
		});

		it("is a valid retention option", () => {
			expect(RETENTION_OPTIONS).toContain(DEFAULT_RETENTION_DAYS);
		});
	});

	describe("parseRetentionDays", () => {
		it("accepts 1", () => {
			expect(parseRetentionDays(1)).toBe(1);
		});

		it("accepts 7", () => {
			expect(parseRetentionDays(7)).toBe(7);
		});

		it("accepts 30", () => {
			expect(parseRetentionDays(30)).toBe(30);
		});

		it('accepts string "1"', () => {
			expect(parseRetentionDays("1")).toBe(1);
		});

		it('accepts string "7"', () => {
			expect(parseRetentionDays("7")).toBe(7);
		});

		it('accepts string "30"', () => {
			expect(parseRetentionDays("30")).toBe(30);
		});

		it("rejects 0", () => {
			expect(parseRetentionDays(0)).toBeNull();
		});

		it("rejects 2", () => {
			expect(parseRetentionDays(2)).toBeNull();
		});

		it("rejects 90", () => {
			expect(parseRetentionDays(90)).toBeNull();
		});

		it("rejects negative numbers", () => {
			expect(parseRetentionDays(-1)).toBeNull();
		});

		it("rejects non-numeric string", () => {
			expect(parseRetentionDays("abc")).toBeNull();
		});

		it("rejects empty string", () => {
			expect(parseRetentionDays("")).toBeNull();
		});

		it("rejects null", () => {
			expect(parseRetentionDays(null)).toBeNull();
		});

		it("rejects undefined", () => {
			expect(parseRetentionDays(undefined)).toBeNull();
		});

		it("rejects boolean", () => {
			expect(parseRetentionDays(true)).toBeNull();
		});

		it("rejects object", () => {
			expect(parseRetentionDays({})).toBeNull();
		});

		it("rejects NaN", () => {
			expect(parseRetentionDays(Number.NaN)).toBeNull();
		});

		it("rejects float 7.5", () => {
			expect(parseRetentionDays(7.5)).toBeNull();
		});
	});
});
