import { describe, expect, test } from "vitest";
import {
	bearerToken,
	generateAuthCode,
	generateWorkstationToken,
	hashSecret,
	pkceChallenge,
} from "./workstation-token.js";

describe("workstation credentials", () => {
	test("keys are batw_ prefixed 256-bit values with 43 base64url characters", () => {
		const token = generateWorkstationToken();
		expect(token).toMatch(/^batw_[A-Za-z0-9_-]{43}$/);
		expect(generateWorkstationToken()).not.toBe(token);
	});

	test("auth codes are opaque 43 character base64url values", () => {
		const code = generateAuthCode();
		expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(generateAuthCode()).not.toBe(code);
	});

	test("hashing is a stable SHA-256 hex digest", async () => {
		const digest = await hashSecret("batw_example");
		expect(digest).toMatch(/^[0-9a-f]{64}$/);
		expect(await hashSecret("batw_example")).toBe(digest);
		expect(await hashSecret("batw_other")).not.toBe(digest);
	});

	test("PKCE S256 matches the RFC 7636 example", async () => {
		expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
			"E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
		);
	});

	test("bearer parsing accepts only a single Bearer credential", () => {
		expect(bearerToken("Bearer batw_abc")).toBe("batw_abc");
		expect(bearerToken(undefined)).toBeNull();
		expect(bearerToken("")).toBeNull();
		expect(bearerToken("batw_abc")).toBeNull();
		expect(bearerToken("Bearer a b")).toBeNull();
		expect(bearerToken("Basic batw_abc")).toBeNull();
	});
});
