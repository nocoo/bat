import { describe, expect, test } from "bun:test";
import { formatLastSeen, formatUptime } from "./host-card";

describe("formatUptime", () => {
	test("returns dash for null", () => {
		expect(formatUptime(null)).toBe("—");
	});

	test("returns dash for zero", () => {
		expect(formatUptime(0)).toBe("—");
	});

	test("returns hours and minutes for short uptime", () => {
		expect(formatUptime(7200)).toBe("2h 0m"); // 2 hours
	});

	test("returns days and hours for long uptime", () => {
		expect(formatUptime(90000)).toBe("1d 1h"); // 1 day 1 hour
	});

	test("handles minutes correctly", () => {
		expect(formatUptime(5400)).toBe("1h 30m"); // 1.5 hours
	});
});

describe("formatLastSeen", () => {
	test("returns just now for recent timestamp", () => {
		const now = Math.floor(Date.now() / 1000);
		expect(formatLastSeen(now - 10)).toBe("just now");
	});

	test("returns minutes ago", () => {
		const now = Math.floor(Date.now() / 1000);
		expect(formatLastSeen(now - 300)).toBe("5m ago");
	});

	test("returns hours ago", () => {
		const now = Math.floor(Date.now() / 1000);
		expect(formatLastSeen(now - 7200)).toBe("2h ago");
	});

	test("returns days ago", () => {
		const now = Math.floor(Date.now() / 1000);
		expect(formatLastSeen(now - 172800)).toBe("2d ago");
	});
});
