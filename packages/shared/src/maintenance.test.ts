// @bat/shared — Maintenance window utility tests
import { describe, expect, test } from "vitest";
import { isInMaintenanceWindow, isValidTimeHHMM, toUtcHHMM } from "./maintenance.js";

describe("isValidTimeHHMM", () => {
	test("valid times", () => {
		expect(isValidTimeHHMM("00:00")).toBe(true);
		expect(isValidTimeHHMM("23:59")).toBe(true);
		expect(isValidTimeHHMM("12:30")).toBe(true);
		expect(isValidTimeHHMM("03:00")).toBe(true);
		expect(isValidTimeHHMM("09:05")).toBe(true);
	});

	test("invalid formats", () => {
		expect(isValidTimeHHMM("")).toBe(false);
		expect(isValidTimeHHMM("3:00")).toBe(false); // not zero-padded
		expect(isValidTimeHHMM("03:0")).toBe(false);
		expect(isValidTimeHHMM("003:00")).toBe(false);
		expect(isValidTimeHHMM("03:000")).toBe(false);
		expect(isValidTimeHHMM("abc")).toBe(false);
		expect(isValidTimeHHMM("12:30:00")).toBe(false); // includes seconds
		expect(isValidTimeHHMM("12-30")).toBe(false);
	});

	test("out-of-range values", () => {
		expect(isValidTimeHHMM("24:00")).toBe(false);
		expect(isValidTimeHHMM("25:00")).toBe(false);
		expect(isValidTimeHHMM("23:60")).toBe(false);
		expect(isValidTimeHHMM("99:99")).toBe(false);
	});
});

describe("isInMaintenanceWindow", () => {
	describe("same-day window (start < end)", () => {
		const start = "03:00";
		const end = "05:00";

		test("before window", () => {
			expect(isInMaintenanceWindow("02:59", start, end)).toBe(false);
		});

		test("at window start (inclusive)", () => {
			expect(isInMaintenanceWindow("03:00", start, end)).toBe(true);
		});

		test("inside window", () => {
			expect(isInMaintenanceWindow("04:00", start, end)).toBe(true);
			expect(isInMaintenanceWindow("03:01", start, end)).toBe(true);
			expect(isInMaintenanceWindow("04:59", start, end)).toBe(true);
		});

		test("at window end (exclusive)", () => {
			expect(isInMaintenanceWindow("05:00", start, end)).toBe(false);
		});

		test("after window", () => {
			expect(isInMaintenanceWindow("05:01", start, end)).toBe(false);
			expect(isInMaintenanceWindow("23:00", start, end)).toBe(false);
		});
	});

	describe("cross-midnight window (start > end)", () => {
		const start = "23:00";
		const end = "02:00";

		test("before start, after end (not in window)", () => {
			expect(isInMaintenanceWindow("02:00", start, end)).toBe(false);
			expect(isInMaintenanceWindow("12:00", start, end)).toBe(false);
			expect(isInMaintenanceWindow("22:59", start, end)).toBe(false);
		});

		test("at window start (inclusive)", () => {
			expect(isInMaintenanceWindow("23:00", start, end)).toBe(true);
		});

		test("after midnight, before end", () => {
			expect(isInMaintenanceWindow("00:00", start, end)).toBe(true);
			expect(isInMaintenanceWindow("01:00", start, end)).toBe(true);
			expect(isInMaintenanceWindow("01:59", start, end)).toBe(true);
		});

		test("at window end (exclusive)", () => {
			expect(isInMaintenanceWindow("02:00", start, end)).toBe(false);
		});

		test("during evening portion", () => {
			expect(isInMaintenanceWindow("23:30", start, end)).toBe(true);
			expect(isInMaintenanceWindow("23:59", start, end)).toBe(true);
		});
	});

	describe("edge cases", () => {
		test("full-day window (00:00 -> 00:00 rejected by validation, but if called)", () => {
			// start === end means start < end is false, so cross-midnight logic:
			// now >= "00:00" || now < "00:00" — always true for any non-00:00, true at 00:00
			// This is effectively a 24h window, but validation prevents start === end
			expect(isInMaintenanceWindow("12:00", "00:00", "00:00")).toBe(true);
		});

		test("window from 00:00 to 06:00 (early morning)", () => {
			expect(isInMaintenanceWindow("00:00", "00:00", "06:00")).toBe(true);
			expect(isInMaintenanceWindow("05:59", "00:00", "06:00")).toBe(true);
			expect(isInMaintenanceWindow("06:00", "00:00", "06:00")).toBe(false);
		});

		test("window ending at midnight (22:00 -> 00:00)", () => {
			// start > end → cross-midnight: now >= 22:00 || now < 00:00
			expect(isInMaintenanceWindow("22:00", "22:00", "00:00")).toBe(true);
			expect(isInMaintenanceWindow("23:59", "22:00", "00:00")).toBe(true);
			expect(isInMaintenanceWindow("00:00", "22:00", "00:00")).toBe(false);
			expect(isInMaintenanceWindow("21:59", "22:00", "00:00")).toBe(false);
		});
	});
});

describe("toUtcHHMM", () => {
	test("midnight", () => {
		// 2024-01-01T00:00:00Z
		expect(toUtcHHMM(1704067200)).toBe("00:00");
	});

	test("noon", () => {
		// 2024-01-01T12:00:00Z
		expect(toUtcHHMM(1704067200 + 12 * 3600)).toBe("12:00");
	});

	test("3:05 AM", () => {
		// 2024-01-01T03:05:00Z
		expect(toUtcHHMM(1704067200 + 3 * 3600 + 5 * 60)).toBe("03:05");
	});

	test("23:59", () => {
		// 2024-01-01T23:59:00Z
		expect(toUtcHHMM(1704067200 + 23 * 3600 + 59 * 60)).toBe("23:59");
	});

	test("ignores seconds within the minute", () => {
		// 2024-01-01T03:05:45Z — should still return 03:05
		expect(toUtcHHMM(1704067200 + 3 * 3600 + 5 * 60 + 45)).toBe("03:05");
	});
});
