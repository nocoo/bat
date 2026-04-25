import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ApiError, buildUrl, deleteAPI, getAPI, postAPI, putAPI } from "./api";

// Minimal fetch stub — records every call and returns a configurable Response.
interface Call {
	url: string;
	init: RequestInit | undefined;
}
let calls: Call[];
let nextResponse: () => Response;
const originalFetch = globalThis.fetch;

beforeEach(() => {
	calls = [];
	nextResponse = () =>
		new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
	// biome-ignore lint/suspicious/noExplicitAny: test stub
	globalThis.fetch = ((url: any, init?: any) => {
		calls.push({ url: String(url), init });
		return Promise.resolve(nextResponse());
		// biome-ignore lint/suspicious/noExplicitAny: test stub
	}) as any;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("buildUrl", () => {
	test("returns the path unchanged when no params", () => {
		expect(buildUrl("/api/x")).toBe("/api/x");
	});

	test("returns the path unchanged for empty params", () => {
		expect(buildUrl("/api/x", {})).toBe("/api/x");
	});

	test("appends a query string from params", () => {
		expect(buildUrl("/api/x", { a: "1", b: "2" })).toBe("/api/x?a=1&b=2");
	});

	test("URL-encodes param values", () => {
		expect(buildUrl("/api/x", { q: "a b&c" })).toBe("/api/x?q=a+b%26c");
	});
});

describe("ApiError", () => {
	test("carries status and message", () => {
		const e = new ApiError(418, "teapot");
		expect(e).toBeInstanceOf(Error);
		expect(e.name).toBe("ApiError");
		expect(e.status).toBe(418);
		expect(e.message).toBe("teapot");
	});
});

describe("getAPI", () => {
	test("issues a GET with no body or content-type", async () => {
		nextResponse = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
		const data = await getAPI<{ ok: boolean }>("/api/me");
		expect(data).toEqual({ ok: true });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe("/api/me");
		expect(calls[0]?.init?.method).toBe("GET");
		expect(calls[0]?.init?.body).toBeUndefined();
	});

	test("encodes query params", async () => {
		await getAPI("/api/events", { limit: "30", offset: "60" });
		expect(calls[0]?.url).toBe("/api/events?limit=30&offset=60");
	});

	test("throws ApiError on non-2xx", async () => {
		nextResponse = () => new Response("nope", { status: 500 });
		await expect(getAPI("/api/x")).rejects.toBeInstanceOf(ApiError);
	});
});

describe("postAPI / putAPI", () => {
	test("POST sends JSON body and content-type", async () => {
		await postAPI("/api/tags", { name: "prod" });
		expect(calls[0]?.init?.method).toBe("POST");
		expect(calls[0]?.init?.body).toBe(JSON.stringify({ name: "prod" }));
		const headers = calls[0]?.init?.headers as Record<string, string> | undefined;
		expect(headers?.["Content-Type"]).toBe("application/json");
	});

	test("POST without body omits the content-type header", async () => {
		await postAPI("/api/webhooks/1/regenerate");
		expect(calls[0]?.init?.body).toBeUndefined();
		expect(calls[0]?.init?.headers).toBeUndefined();
	});

	test("PUT sends JSON body", async () => {
		await putAPI("/api/tags/1", { color: 3 });
		expect(calls[0]?.init?.method).toBe("PUT");
		expect(calls[0]?.init?.body).toBe(JSON.stringify({ color: 3 }));
	});
});

describe("deleteAPI", () => {
	test("issues a DELETE and resolves on 204", async () => {
		nextResponse = () => new Response(null, { status: 204 });
		await expect(deleteAPI("/api/tags/1")).resolves.toBeNull();
		expect(calls[0]?.init?.method).toBe("DELETE");
	});

	test("throws ApiError on non-2xx", async () => {
		nextResponse = () => new Response("forbidden", { status: 403 });
		await expect(deleteAPI("/api/tags/1")).rejects.toBeInstanceOf(ApiError);
	});
});
