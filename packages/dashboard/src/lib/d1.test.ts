import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { d1Query } from "./d1";

describe("d1Query", () => {
	const originalEnv = { ...process.env };
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		process.env.CF_ACCOUNT_ID = "test-account-id";
		process.env.CF_D1_DATABASE_ID = "test-db-id";
		process.env.CF_API_TOKEN = "test-api-token";
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		globalThis.fetch = originalFetch;
		mock.restore();
	});

	test("throws when CF_ACCOUNT_ID is missing", async () => {
		process.env.CF_ACCOUNT_ID = undefined;
		await expect(d1Query("SELECT 1")).rejects.toThrow("CF_ACCOUNT_ID");
	});

	test("throws when CF_D1_DATABASE_ID is missing", async () => {
		process.env.CF_D1_DATABASE_ID = undefined;
		await expect(d1Query("SELECT 1")).rejects.toThrow("CF_D1_DATABASE_ID");
	});

	test("throws when CF_API_TOKEN is missing", async () => {
		process.env.CF_API_TOKEN = undefined;
		await expect(d1Query("SELECT 1")).rejects.toThrow("CF_API_TOKEN");
	});

	test("sends correct request to D1 REST API", async () => {
		let capturedUrl = "";
		let capturedBody = "";
		let capturedHeaders: Record<string, string> = {};

		globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
			capturedUrl = input.toString();
			capturedBody = init?.body as string;
			capturedHeaders = Object.fromEntries(Object.entries(init?.headers as Record<string, string>));
			return new Response(
				JSON.stringify({
					result: [
						{
							results: [{ id: 1, name: "production" }],
							success: true,
							meta: { changes: 0, last_row_id: 0, rows_read: 1, rows_written: 0 },
						},
					],
					success: true,
					errors: [],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}) as typeof fetch;

		const result = await d1Query<{ id: number; name: string }>(
			"SELECT * FROM tags WHERE id = ?",
			[1],
		);

		expect(capturedUrl).toBe(
			"https://api.cloudflare.com/client/v4/accounts/test-account-id/d1/database/test-db-id/query",
		);
		expect(capturedHeaders.Authorization).toBe("Bearer test-api-token");
		expect(capturedHeaders["Content-Type"]).toBe("application/json");
		expect(JSON.parse(capturedBody)).toEqual({
			sql: "SELECT * FROM tags WHERE id = ?",
			params: [1],
		});
		expect(result.results).toEqual([{ id: 1, name: "production" }]);
		expect(result.success).toBe(true);
	});

	test("defaults params to empty array when omitted", async () => {
		let capturedBody = "";

		globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
			capturedBody = init?.body as string;
			return new Response(
				JSON.stringify({
					result: [
						{
							results: [],
							success: true,
							meta: { changes: 0, last_row_id: 0, rows_read: 0, rows_written: 0 },
						},
					],
					success: true,
					errors: [],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}) as typeof fetch;

		await d1Query("SELECT * FROM tags");
		expect(JSON.parse(capturedBody).params).toEqual([]);
	});

	test("throws on HTTP error", async () => {
		globalThis.fetch = (async () => {
			return new Response("Internal Server Error", { status: 500 });
		}) as unknown as typeof fetch;

		await expect(d1Query("SELECT 1")).rejects.toThrow("D1 API error (500)");
	});

	test("throws on D1 query error", async () => {
		globalThis.fetch = (async () => {
			return new Response(
				JSON.stringify({
					result: [],
					success: false,
					errors: [{ message: "no such table: tags" }],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}) as unknown as typeof fetch;

		await expect(d1Query("SELECT * FROM tags")).rejects.toThrow("no such table: tags");
	});
});
