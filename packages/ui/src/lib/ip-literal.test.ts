import { describe, expect, test } from "vitest";
import { literalSegments } from "./ip-literal";

describe("literalSegments", () => {
	test("breaks an IPv6 literal after every colon and keeps every character", () => {
		const value = "2001:db8:85a3:8d3:1319:8a2e:370:7348";
		const segments = literalSegments(value);
		expect(segments).toEqual(["2001:", "db8:", "85a3:", "8d3:", "1319:", "8a2e:", "370:", "7348"]);
		expect(segments.join("")).toBe(value);
	});

	test("keeps a compressed run attached to its neighbour", () => {
		const value = "2001:db8::1";
		const segments = literalSegments(value);
		expect(segments).toEqual(["2001:", "db8::", "1"]);
		expect(segments.join("")).toBe(value);
	});

	test("handles a leading compressed run", () => {
		expect(literalSegments("::1")).toEqual(["::", "1"]);
		expect(literalSegments("::").join("")).toBe("::");
	});

	test("breaks an IPv4 literal after every dot", () => {
		expect(literalSegments("203.0.113.10")).toEqual(["203.", "0.", "113.", "10"]);
		expect(literalSegments("203.0.113.10").join("")).toBe("203.0.113.10");
	});

	test("never breaks inside an octet or a group", () => {
		for (const value of ["203.0.113.10", "2001:db8:85a3:8d3:1319:8a2e:370:7348"]) {
			for (const segment of literalSegments(value).slice(0, -1)) {
				expect(segment.endsWith(":") || segment.endsWith(".")).toBe(true);
			}
		}
	});

	test("returns no segments for an empty literal", () => {
		expect(literalSegments("")).toEqual([]);
	});
});
