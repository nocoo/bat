import { Hono } from "hono";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, test } from "vitest";
import type { AppEnv } from "../types";
import { accessAuth } from "./access-auth";
import { apiKeyAuth } from "./api-key";

describe("local fixture identity uses the real verifier", () => {
	test("signature, issuer, audience, expiry and static scopes are enforced", async () => {
		const pair = await generateKeyPair("RS256");
		const other = await generateKeyPair("RS256");
		const app = new Hono<AppEnv>();
		app.use("*", accessAuth, apiKeyAuth);
		app.get("/api/hosts", (c) => c.json({ ok: true }));
		app.patch("/api/hosts/a/description", (c) => c.json({ ok: true }));
		const env = {
			ENVIRONMENT: "development",
			CF_ACCESS_TEAM_DOMAIN: "fixture.invalid",
			CF_ACCESS_AUD: "local",
			CF_ACCESS_LOCAL_JWKS: JSON.stringify({ keys: [await exportJWK(pair.publicKey)] }),
			BAT_WRITE_KEY: "write",
			BAT_READ_KEY: "read",
		} as AppEnv["Bindings"];
		const sign = (
			issuer = "https://fixture.invalid",
			audience = "local",
			expiry = "1h",
			key = pair.privateKey,
		) =>
			new SignJWT({ email: "viewer@example.test" })
				.setProtectedHeader({ alg: "RS256" })
				.setIssuer(issuer)
				.setAudience(audience)
				.setExpirationTime(expiry)
				.sign(key);
		const get = (token: string) =>
			app.request(
				"http://localhost/api/hosts",
				{ headers: { "Cf-Access-Jwt-Assertion": token } },
				env,
			);
		expect((await get(await sign())).status).toBe(200);
		for (const jwt of [
			await sign("https://wrong.invalid"),
			await sign(undefined, "wrong"),
			await sign(undefined, undefined, "-1h"),
			await sign(undefined, undefined, undefined, other.privateKey),
		])
			expect((await get(jwt)).status).toBe(403);
		expect((await app.request("http://localhost/api/hosts", {}, env)).status).toBe(401);
		expect(
			(
				await app.request(
					"http://localhost/api/hosts/a/description",
					{ method: "PATCH", headers: { Authorization: "Bearer read" } },
					env,
				)
			).status,
		).toBe(403);
		expect(
			(
				await app.request(
					"http://localhost/api/hosts/a/description",
					{ method: "PATCH", headers: { Authorization: "Bearer write" } },
					env,
				)
			).status,
		).toBe(200);
	});
});
