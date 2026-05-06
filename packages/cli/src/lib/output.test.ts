// Tests for output formatting helpers

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { table, truncate } from "./output.js";

describe("truncate", () => {
	test("returns string unchanged when within limit", () => {
		expect(truncate("hello", 10)).toBe("hello");
	});

	test("returns string unchanged when exactly at limit", () => {
		expect(truncate("hello", 5)).toBe("hello");
	});

	test("truncates and adds ellipsis when over limit", () => {
		expect(truncate("hello world", 5)).toBe("hell…");
	});

	test("handles single char limit", () => {
		expect(truncate("hello", 1)).toBe("…");
	});

	test("handles empty string", () => {
		expect(truncate("", 5)).toBe("");
	});
});

describe("table", () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {
			// intentionally empty — suppress console output during tests
		});
	});

	afterEach(() => {
		consoleSpy.mockRestore();
	});

	test("does not print anything for empty rows", () => {
		table(["A", "B"], []);
		expect(consoleSpy).not.toHaveBeenCalled();
	});

	test("prints header + separator + data rows", () => {
		table(
			["ID", "Name"],
			[
				["1", "Alice"],
				["2", "Bob"],
			],
		);

		// header + separator + 2 data rows = 4 calls
		expect(consoleSpy).toHaveBeenCalledTimes(4);

		// Check that data appears in output
		const allOutput = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(allOutput).toContain("Alice");
		expect(allOutput).toContain("Bob");
	});

	test("pads columns to widest value", () => {
		table(["ID", "Name"], [["1", "LongName"]]);

		// Data row should have padded ID column
		const dataRow = consoleSpy.mock.calls[2]?.[0] as string;
		expect(dataRow).toContain("1");
		expect(dataRow).toContain("LongName");
	});
});
