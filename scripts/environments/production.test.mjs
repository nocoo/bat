import assert from "node:assert/strict";
import { test } from "node:test";
import { authenticateProd } from "./production.mjs";

test("cached user token stays server-side and verifies the fixed production target", async () => {
	const headers = await authenticateProd({
		run: async () => ({ stdout: "header.payload.signature\n" }),
		request: async (url, options) => {
			assert.equal(url, "https://bat.hexly.ai/api/me");
			assert.equal(options.redirect, "manual");
			assert.equal(options.headers["cf-access-token"], "header.payload.signature");
			return Response.json({ authenticated: true, email: "person@example.test" });
		},
	});
	assert.deepEqual(headers, { "cf-access-token": "header.payload.signature" });
});

test("expired cache opens quiet user login before reading a fresh token", async () => {
	const commands = [];
	await authenticateProd({
		run: async (_command, args) => {
			commands.push(args);
			if (commands.length === 1) throw new Error("expired");
			return { stdout: "header.payload.signature" };
		},
		request: async () => Response.json({ authenticated: true, email: "person@example.test" }),
	});
	assert.deepEqual(
		commands.map((args) => args[1]),
		["token", "login", "token"],
	);
	assert.ok(commands[1].includes("--quiet"));
});

test("login errors never expose subprocess secrets or contact production", async () => {
	await assert.rejects(
		authenticateProd({
			run: async () => {
				throw new Error("secret-token");
			},
			request: async () => assert.fail("must not fetch"),
		}),
		(error) =>
			error.message.includes("Complete Access login") && !error.message.includes("secret-token"),
	);
});

for (const result of [
	() => new Response(null, { status: 302 }),
	() => Response.json({ authenticated: true }),
	() => Response.json({ authenticated: false, email: "person@example.test" }),
]) {
	test(`reject unverified production identity ${result.toString()}`, async () => {
		await assert.rejects(
			authenticateProd({
				run: async () => ({ stdout: "header.payload.signature" }),
				request: async () => result(),
			}),
			/could not be verified/,
		);
	});
}
