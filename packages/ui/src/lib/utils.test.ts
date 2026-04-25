import { describe, expect, test } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
	test("merges class strings", () => {
		expect(cn("a", "b")).toBe("a b");
	});

	test("dedupes conflicting tailwind utilities (later wins)", () => {
		expect(cn("p-2", "p-4")).toBe("p-4");
	});

	test("filters falsy values", () => {
		expect(cn("a", false, null, undefined, "b")).toBe("a b");
	});
});
