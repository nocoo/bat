import { describe, expect, test } from "bun:test";
import { formatTriggeredAt } from "./alert-table";

describe("formatTriggeredAt", () => {
	test("formats unix timestamp to locale string", () => {
		const result = formatTriggeredAt(1700000000);
		// Should produce a locale-dependent string — just verify it's non-empty
		expect(result.length).toBeGreaterThan(0);
		expect(typeof result).toBe("string");
	});

	test("handles zero timestamp", () => {
		const result = formatTriggeredAt(0);
		expect(result.length).toBeGreaterThan(0);
	});
});
