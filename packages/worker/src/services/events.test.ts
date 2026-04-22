// Tests for generateWebhookToken — pure fn over crypto.getRandomValues.
import { describe, expect, test } from "bun:test";
import { generateWebhookToken } from "./events";

describe("generateWebhookToken", () => {
	test("returns a 32-character string", () => {
		expect(generateWebhookToken()).toHaveLength(32);
	});

	test("uses only lowercase hex digits", () => {
		const token = generateWebhookToken();
		expect(token).toMatch(/^[0-9a-f]{32}$/);
	});

	test("produces unique values across many invocations", () => {
		const tokens = new Set<string>();
		for (let i = 0; i < 200; i++) {
			tokens.add(generateWebhookToken());
		}
		// Collisions at 128 bits of entropy are astronomically unlikely;
		// if this ever fires, something is wrong with the RNG wiring.
		expect(tokens.size).toBe(200);
	});

	test("has reasonable byte-value spread (not all zeros)", () => {
		const token = generateWebhookToken();
		const nonZero = token.split("").filter((c) => c !== "0").length;
		expect(nonZero).toBeGreaterThan(0);
	});

	test("is self-consistent: length * 4 bits = 128 bits of entropy", () => {
		// 32 hex chars = 16 bytes = 128 bits; guard against accidental shrinkage
		const token = generateWebhookToken();
		expect(token.length * 4).toBe(128);
	});
});
