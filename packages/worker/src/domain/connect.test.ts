import { describe, expect, test } from "vitest";
import {
	configuredManager,
	fingerprint,
	randomSecret,
	seal,
	tokenContext,
	unseal,
	validateTokenInput,
} from "./connect.js";

describe("Connect recoverable encryption", () => {
	test("AEAD binds each secret to its purpose, deployment, server, identity, scope and issuer", async () => {
		const keys = JSON.stringify({ active: "k1", keys: { k1: randomSecret() } });
		const token = {
			id: "id",
			server_id: "a",
			scope: "read" as const,
			owner: "email:owner@example.invalid",
			expires_at: null,
		};
		const context = tokenContext("deployment-a", token);
		const plaintext = randomSecret();
		const ciphertext = await seal(keys, context, plaintext);
		expect(ciphertext.includes(plaintext)).toBe(false);
		expect((await unseal(keys, context, ciphertext)) === plaintext).toBe(true);
		expect((await seal(keys, context, plaintext)) === ciphertext).toBe(false);
		for (const wrong of [
			"request",
			tokenContext("deployment-b", token),
			tokenContext("deployment-a", { ...token, server_id: "b" }),
			tokenContext("deployment-a", { ...token, id: "other" }),
			tokenContext("deployment-a", { ...token, scope: "write" }),
			tokenContext("deployment-a", { ...token, owner: "email:other@example.invalid" }),
			tokenContext("deployment-a", { ...token, expires_at: 100 }),
		]) {
			await expect(unseal(keys, wrong, ciphertext)).rejects.toMatchObject({
				code: "decryption_failed",
			});
		}
		const parts = ciphertext.split(".");
		parts[3] = `${parts[3]?.[0] === "A" ? "B" : "A"}${parts[3]?.slice(1)}`;
		await expect(unseal(keys, context, parts.join("."))).rejects.toMatchObject({
			code: "decryption_failed",
		});
		await expect(unseal(keys, context, "2.invalid.nonce.data")).rejects.toMatchObject({
			code: "decryption_failed",
		});
	});

	test("keyring rotation reads retained key IDs and fails closed when encryption material is missing", async () => {
		const old = randomSecret(),
			next = randomSecret();
		const oldRing = JSON.stringify({ active: "k1", keys: { k1: old } });
		const rotated = JSON.stringify({ active: "k2", keys: { k1: old, k2: next } });
		const encrypted = await seal(oldRing, "context", "fixture");
		expect(await unseal(rotated, "context", encrypted)).toBe("fixture");
		expect((await seal(rotated, "context", "fixture")).startsWith("1.k2.")).toBe(true);
		await expect(
			unseal(JSON.stringify({ active: "k2", keys: { k2: next } }), "context", encrypted),
		).rejects.toMatchObject({ code: "decryption_failed" });
		for (const bad of [
			undefined,
			"{}",
			"invalid",
			JSON.stringify({ active: "../key", keys: {} }),
			JSON.stringify({ active: "k1", keys: { k1: "AA" } }),
			JSON.stringify({ active: "k1", keys: { k1: "!invalid!" } }),
			JSON.stringify({ active: "k1", keys: { k1: 42 } }),
			JSON.stringify({ active: "k1", keys: null }),
			JSON.stringify({ active: "k1", keys: [] }),
		]) {
			await expect(seal(bad, "context", "fixture")).rejects.toMatchObject({
				code: "encryption_unavailable",
			});
		}
		expect((await fingerprint("one")) === (await fingerprint("two"))).toBe(false);
		const large = "fixture🦇".repeat(20_000);
		expect(
			(await unseal(oldRing, "large-response", await seal(oldRing, "large-response", large))) ===
				large,
		).toBe(true);
	});

	test("names, scope and optional expiry reject ambiguous input", () => {
		expect(validateTokenInput({ name: " Daily ", scope: "write" }, 100)).toEqual({
			name: "Daily",
			scope: "write",
			expiresAt: null,
		});
		expect(
			validateTokenInput({ name: "Daily", scope: "read", expiresAt: "2026-01-01T00:00:00Z" }, 100)
				.expiresAt,
		).toBeGreaterThan(100);
		for (const name of [null, "", " ", "a".repeat(65), "line\nnew", `secret-${"batc_"}`])
			expect(() => validateTokenInput({ name, scope: "read" }, 100)).toThrow();
		expect(() => validateTokenInput({ name: "a", scope: "admin" }, 100)).toThrow();
		for (const expiresAt of [42, "tomorrow", "2026-99-99T00:00:00Z", "1970-01-01T00:00:00Z"])
			expect(() => validateTokenInput({ name: "a", scope: "read", expiresAt }, 100)).toThrow();
		expect(
			configuredManager(" , EMAIL:Owner@Example.Invalid , ", "email:owner@example.invalid"),
		).toBe(true);
		expect(configuredManager(undefined, "email:owner@example.invalid")).toBe(false);
	});
});
