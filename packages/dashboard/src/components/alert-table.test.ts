import { describe, expect, test } from "bun:test";
import { formatTriggeredAt } from "./alert-table";

describe("formatTriggeredAt", () => {
	test("returns 'just now' for recent timestamps", () => {
		const now = Math.floor(Date.now() / 1000);
		expect(formatTriggeredAt(now)).toBe("just now");
		expect(formatTriggeredAt(now - 30)).toBe("just now");
	});

	test("returns minutes ago", () => {
		const now = Math.floor(Date.now() / 1000);
		expect(formatTriggeredAt(now - 300)).toBe("5m ago");
	});

	test("returns hours ago", () => {
		const now = Math.floor(Date.now() / 1000);
		expect(formatTriggeredAt(now - 7200)).toBe("2h ago");
	});

	test("returns days ago", () => {
		const now = Math.floor(Date.now() / 1000);
		expect(formatTriggeredAt(now - 172800)).toBe("2d ago");
	});
});
