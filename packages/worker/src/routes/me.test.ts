// Tests for /api/me — Access JWT payload decode + anonymous fallback.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AUTHOR_PROFILE_URL, hashEmail } from "../lib/author-profile";
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

const fetchMock = vi.fn();

beforeEach(() => {
	fetchMock.mockReset();
	fetchMock.mockResolvedValue(
		new Response(JSON.stringify({ name: null, avatar: null }), { status: 200 }),
	);
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

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
		const res = await meRoute(makeCtx(undefined) as Parameters<typeof meRoute>[0]);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			email: null,
			name: null,
			avatar: null,
			authenticated: false,
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("returns anonymous when JWT is malformed", async () => {
		const res = await meRoute(makeCtx("not.a.jwt") as Parameters<typeof meRoute>[0]);
		expect(await res.json()).toEqual({
			email: null,
			name: null,
			avatar: null,
			authenticated: false,
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("returns JWT name when author profile misses", async () => {
		const jwt = makeJwt({ email: "zheng@example.com", name: "Zheng" });
		const res = await meRoute(makeCtx(jwt) as Parameters<typeof meRoute>[0]);
		expect(await res.json()).toEqual({
			email: "zheng@example.com",
			name: "Zheng",
			avatar: null,
			authenticated: true,
		});
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url] = fetchMock.mock.calls[0] as [string];
		expect(url).toBe(`${AUTHOR_PROFILE_URL}?hash=${await hashEmail("zheng@example.com")}`);
	});

	test("prefers author profile name and avatar on a hit", async () => {
		fetchMock.mockResolvedValue(
			new Response(
				JSON.stringify({
					name: "Zheng Li",
					avatar: "https://cdn.example/avatar-80.jpg",
				}),
				{ status: 200 },
			),
		);
		const jwt = makeJwt({ email: "architie@gmail.com", name: "architie" });
		const res = await meRoute(makeCtx(jwt) as Parameters<typeof meRoute>[0]);
		expect(await res.json()).toEqual({
			email: "architie@gmail.com",
			name: "Zheng Li",
			avatar: "https://cdn.example/avatar-80.jpg",
			authenticated: true,
		});
	});

	test("falls back to email local-part when name is missing", async () => {
		const jwt = makeJwt({ email: "alice@example.com" });
		const res = await meRoute(makeCtx(jwt) as Parameters<typeof meRoute>[0]);
		expect(await res.json()).toEqual({
			email: "alice@example.com",
			name: "alice",
			avatar: null,
			authenticated: true,
		});
	});

	test("returns null name when both name and email are missing", async () => {
		const jwt = makeJwt({});
		const res = await meRoute(makeCtx(jwt) as Parameters<typeof meRoute>[0]);
		expect(await res.json()).toEqual({
			email: null,
			name: null,
			avatar: null,
			authenticated: true,
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("keeps JWT name when author profile returns 429", async () => {
		fetchMock.mockResolvedValue(new Response("rate limited", { status: 429 }));
		const jwt = makeJwt({ email: "alice@example.com", name: "Alice" });
		const res = await meRoute(makeCtx(jwt) as Parameters<typeof meRoute>[0]);
		expect(await res.json()).toEqual({
			email: "alice@example.com",
			name: "Alice",
			avatar: null,
			authenticated: true,
		});
	});
});
