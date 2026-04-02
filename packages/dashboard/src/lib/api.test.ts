import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ApiError, fetchAPI } from "./api";

describe("fetchAPI", () => {
	const originalFetch = globalThis.fetch;

	// Mock window.location.origin for URL resolution
	const originalWindow = globalThis.window;
	beforeEach(() => {
		// @ts-expect-error: partial mock
		globalThis.window = { location: { origin: "http://localhost:7025" } };
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		// @ts-expect-error: restore original
		globalThis.window = originalWindow;
	});

	test("fetches from correct URL", async () => {
		let capturedUrl = "";
		globalThis.fetch = (async (input: string | URL | Request) => {
			capturedUrl = input.toString();
			return new Response(JSON.stringify([{ host_id: "h1" }]), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as typeof fetch;

		const data = await fetchAPI<Array<{ host_id: string }>>("/api/hosts");
		expect(capturedUrl).toBe("http://localhost:7025/api/hosts");
		expect(data).toEqual([{ host_id: "h1" }]);
	});

	test("appends query params", async () => {
		let capturedUrl = "";
		globalThis.fetch = (async (input: string | URL | Request) => {
			capturedUrl = input.toString();
			return new Response("{}", { status: 200 });
		}) as typeof fetch;

		await fetchAPI("/api/hosts/h1/metrics", { from: "1000", to: "2000" });
		expect(capturedUrl).toBe("http://localhost:7025/api/hosts/h1/metrics?from=1000&to=2000");
	});

	test("throws ApiError on non-ok response", async () => {
		globalThis.fetch = (async () => {
			return new Response("Unauthorized", { status: 401 });
		}) as unknown as typeof fetch;

		try {
			await fetchAPI("/api/hosts");
			expect(true).toBe(false); // should not reach
		} catch (err) {
			expect(err).toBeInstanceOf(ApiError);
			expect((err as ApiError).status).toBe(401);
		}
	});

	test("ApiError has correct message", () => {
		const err = new ApiError(500, "Server error");
		expect(err.name).toBe("ApiError");
		expect(err.status).toBe(500);
		expect(err.message).toBe("Server error");
	});
});
