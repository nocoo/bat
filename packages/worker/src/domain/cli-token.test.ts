// Pure helper tests for generateCliToken / hashToken (no I/O).

import { describe, expect, test } from "vitest";
import { generateCliToken, hashToken } from "./cli-token";

describe("generateCliToken", () => {
	test("returns a 64-char lowercase hex string", () => {
		const t = generateCliToken();
		expect(t).toMatch(/^[0-9a-f]{64}$/);
	});

	test("produces unique values across many invocations", () => {
		const set = new Set<string>();
		for (let i = 0; i < 100; i++) {
			set.add(generateCliToken());
		}
		expect(set.size).toBe(100);
	});

	test("is exactly 256 bits of entropy (32 bytes hex-encoded)", () => {
		expect(generateCliToken().length * 4).toBe(256);
	});
});

describe("hashToken", () => {
	test("returns a 64-char lowercase hex SHA-256 digest", async () => {
		const h = await hashToken("hello");
		expect(h).toMatch(/^[0-9a-f]{64}$/);
		// SHA-256("hello") is well-known
		expect(h).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
	});

	test("is deterministic for identical inputs", async () => {
		expect(await hashToken("x")).toBe(await hashToken("x"));
	});

	test("differs for different inputs", async () => {
		expect(await hashToken("a")).not.toBe(await hashToken("b"));
	});
});
