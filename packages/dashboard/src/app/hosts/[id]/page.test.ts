import { describe, expect, test } from "bun:test";
import { formatBootTime } from "./page";

describe("formatBootTime", () => {
	test("returns null for null", () => {
		expect(formatBootTime(null)).toBeNull();
	});

	test("returns null for undefined", () => {
		expect(formatBootTime(undefined)).toBeNull();
	});

	test("formats unix timestamp to locale string", () => {
		// 2024-01-01T00:00:00Z
		const result = formatBootTime(1704067200);
		expect(result).toBeTruthy();
		expect(typeof result).toBe("string");
	});
});
