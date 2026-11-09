import { describe, expect, test } from "vitest";
import { formatCoreCount, formatSpecSize } from "./host-spec-format";

describe("formatCoreCount", () => {
	test("renders the singular form for one core", () => {
		expect(formatCoreCount(1)).toBe("1 core");
	});

	test("renders the plural form for more cores", () => {
		expect(formatCoreCount(4)).toBe("4 cores");
		expect(formatCoreCount(32)).toBe("32 cores");
	});

	test("keeps the honest dash for missing readings", () => {
		expect(formatCoreCount(null)).toBe("—");
		expect(formatCoreCount(0)).toBe("—");
		expect(formatCoreCount(Number.NaN)).toBe("—");
		expect(formatCoreCount(Number.POSITIVE_INFINITY)).toBe("—");
	});
});

describe("formatSpecSize", () => {
	test("renders gigabytes without decimals", () => {
		expect(formatSpecSize(1137889280)).toBe("1 GB");
		expect(formatSpecSize(32 * 1024 ** 3)).toBe("32 GB");
		expect(formatSpecSize(21620326400)).toBe("20 GB");
	});

	test("falls back to megabytes below one gigabyte", () => {
		expect(formatSpecSize(512 * 1024 ** 2)).toBe("512 MB");
	});

	test("keeps the honest dash for missing readings", () => {
		expect(formatSpecSize(null)).toBe("—");
		expect(formatSpecSize(0)).toBe("—");
		expect(formatSpecSize(Number.NaN)).toBe("—");
	});
});
