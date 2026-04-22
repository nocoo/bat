import { describe, expect, test } from "bun:test";
import { formatTimestamp } from "./format";

describe("formatTimestamp", () => {
	test("delegates to Date.toLocaleString on the provided unix-second timestamp", () => {
		const ts = 1_700_000_000;
		expect(formatTimestamp(ts)).toBe(new Date(ts * 1000).toLocaleString());
	});

	test("zero timestamp formats as the unix epoch local time", () => {
		expect(formatTimestamp(0)).toBe(new Date(0).toLocaleString());
	});
});
