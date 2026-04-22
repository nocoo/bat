// Tests for /api/me — Access JWT payload decode + anonymous fallback.
import { describe, expect, test } from "bun:test";
import { decodeJwtPayload, meRoute } from "./me";

function b64url(obj: unknown): string {
	const json = JSON.stringify(obj);
	return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeJwt(payload: unknown): string {
	return `${b64url({ alg: "none" })}.${b64url(payload)}.sig`;
}

function makeCtx(jwt: string | undefined) {
	return {
		req: {
			header: (name: string) => (name === "Cf-Access-Jwt-Assertion" ? jwt : undefined),
		},
		json: (data: unknown, status?: number) =>
			new Response(JSON.stringify(data), {
				status: status ?? 200,
				headers: { "Content-Type": "application/json" },
			}),
	} as unknown as Parameters<typeof meRoute>[0];
}

describe("decodeJwtPayload", () => {
	test("decodes a valid 3-part JWT", () => {
		const jwt = makeJwt({ email: "u@example.com", name: "U" });
		expect(decodeJwtPayload(jwt)).toEqual({ email: "u@example.com", name: "U" });
	});

	test("returns null for wrong part count", () => {
		expect(decodeJwtPayload("a.b")).toBeNull();
		expect(decodeJwtPayload("a.b.c.d")).toBeNull();
	});

	test("returns null for empty middle part", () => {
		expect(decodeJwtPayload("a..c")).toBeNull();
	});

	test("returns null when middle part is not valid JSON", () => {
		expect(decodeJwtPayload("a.!!!.c")).toBeNull();
	});
});

describe("meRoute", () => {
	test("returns anonymous when no JWT header is present", async () => {
		const res = meRoute(makeCtx(undefined) as Parameters<typeof meRoute>[0]);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ email: null, name: null, authenticated: false });
	});

	test("returns anonymous when JWT is malformed", async () => {
		const res = meRoute(makeCtx("not.a.jwt") as Parameters<typeof meRoute>[0]);
		expect(await res.json()).toEqual({ email: null, name: null, authenticated: false });
	});

	test("returns email+name when JWT carries both", async () => {
		const jwt = makeJwt({ email: "zheng@example.com", name: "Zheng" });
		const res = meRoute(makeCtx(jwt) as Parameters<typeof meRoute>[0]);
		expect(await res.json()).toEqual({
			email: "zheng@example.com",
			name: "Zheng",
			authenticated: true,
		});
	});

	test("falls back to email local-part when name is missing", async () => {
		const jwt = makeJwt({ email: "alice@example.com" });
		const res = meRoute(makeCtx(jwt) as Parameters<typeof meRoute>[0]);
		expect(await res.json()).toEqual({
			email: "alice@example.com",
			name: "alice",
			authenticated: true,
		});
	});

	test("returns null name when both name and email are missing", async () => {
		const jwt = makeJwt({});
		const res = meRoute(makeCtx(jwt) as Parameters<typeof meRoute>[0]);
		expect(await res.json()).toEqual({ email: null, name: null, authenticated: true });
	});
});
