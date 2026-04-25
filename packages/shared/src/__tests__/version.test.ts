import { describe, expect, test } from "vitest";
import { BAT_VERSION } from "../version";

describe("BAT_VERSION", () => {
	test("is a semver string", () => {
		expect(BAT_VERSION).toMatch(/^\d+\.\d+\.\d+/);
	});
});
