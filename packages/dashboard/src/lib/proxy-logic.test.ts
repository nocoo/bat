import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { proxyToWorker } from "./proxy-logic";

describe("proxyToWorker", () => {
	const originalEnv = { ...process.env };
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		process.env.BAT_API_URL = "https://bat.test.workers.dev";
		process.env.BAT_READ_KEY = "test-read-key-123";
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		globalThis.fetch = originalFetch;
		mock.restore();
	});

	test("returns 502 when BAT_API_URL is missing", async () => {
		process.env.BAT_API_URL = undefined;
		const res = await proxyToWorker("/api/hosts");
		expect(res.status).toBe(502);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("BAT_API_URL");
	});

	test("returns 502 when BAT_READ_KEY is missing", async () => {
		process.env.BAT_READ_KEY = undefined;
		const res = await proxyToWorker("/api/hosts");
		expect(res.status).toBe(502);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("BAT_READ_KEY");
	});

	test("forwards request to correct Worker URL with auth header", async () => {
		let capturedUrl = "";
		let capturedAuthHeader = "";

		globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
			capturedUrl = input.toString();
			capturedAuthHeader = (init?.headers as Record<string, string>)?.Authorization ?? "";
			return new Response(JSON.stringify([{ host_id: "h1" }]), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as typeof fetch;

		const res = await proxyToWorker("/api/hosts");
		expect(res.status).toBe(200);
		expect(capturedUrl).toBe("https://bat.test.workers.dev/api/hosts");
		expect(capturedAuthHeader).toBe("Bearer test-read-key-123");
		const body = (await res.json()) as Array<{ host_id: string }>;
		expect(body).toEqual([{ host_id: "h1" }]);
	});

	test("forwards search params to Worker", async () => {
		let capturedUrl = "";

		globalThis.fetch = (async (input: string | URL | Request) => {
			capturedUrl = input.toString();
			return new Response("{}", {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as typeof fetch;

		const params = new URLSearchParams({ from: "1000", to: "2000" });
		await proxyToWorker("/api/hosts/h1/metrics", params);
		expect(capturedUrl).toBe("https://bat.test.workers.dev/api/hosts/h1/metrics?from=1000&to=2000");
	});

	test("passes through Worker error status", async () => {
		globalThis.fetch = (async () => {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}) as unknown as typeof fetch;

		const res = await proxyToWorker("/api/hosts/unknown/metrics");
		expect(res.status).toBe(404);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Not found");
	});

	test("returns 502 when fetch throws", async () => {
		globalThis.fetch = (async () => {
			throw new Error("Network error");
		}) as unknown as typeof fetch;

		const res = await proxyToWorker("/api/hosts");
		expect(res.status).toBe(502);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("Failed to reach Worker API");
	});
});
