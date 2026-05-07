// Tests for HTTP client

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError, AuthError, HttpClient, NetworkError } from "./http.js";

// Mock fetch globally
const mockFetch = vi.fn<typeof fetch>();

beforeEach(() => {
	mockFetch.mockReset();
	vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
	vi.restoreAllMocks();
});

/** Helper to create a mock Response */
function mockResponse(status: number, body?: unknown, headers?: Record<string, string>): Response {
	const responseHeaders = new Headers(headers);
	if (!responseHeaders.has("Content-Type")) {
		responseHeaders.set("Content-Type", "application/json");
	}
	return new Response(body !== undefined ? JSON.stringify(body) : null, {
		status,
		headers: responseHeaders,
	});
}

describe("HttpClient", () => {
	describe("GET requests", () => {
		test("sends GET with auth header", async () => {
			mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }));

			const client = new HttpClient("https://bat.hexly.ai", "my-token");
			const result = await client.get<{ ok: boolean }>("/api/agents");

			expect(result).toEqual({ ok: true });
			expect(mockFetch).toHaveBeenCalledOnce();

			const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(url).toBe("https://bat.hexly.ai/api/agents");
			expect(init.method).toBe("GET");
			expect((init.headers as Record<string, string>).Authorization).toBe("Bearer my-token");
		});

		test("sends GET without auth when no token", async () => {
			mockFetch.mockResolvedValueOnce(mockResponse(200, []));

			const client = new HttpClient("https://bat.hexly.ai");
			await client.get("/api/agents");

			const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
		});
	});

	describe("POST requests", () => {
		test("sends POST with JSON body", async () => {
			mockFetch.mockResolvedValueOnce(mockResponse(201, { id: "agt_123" }));

			const client = new HttpClient("https://bat.hexly.ai", "token");
			const result = await client.post<{ id: string }>("/api/agents", {
				source_key: "sk",
				match_key: "mk",
			});

			expect(result).toEqual({ id: "agt_123" });

			const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(init.method).toBe("POST");
			expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
			expect(init.body).toBe(JSON.stringify({ source_key: "sk", match_key: "mk" }));
		});

		test("sends POST without body", async () => {
			mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }));

			const client = new HttpClient("https://bat.hexly.ai", "token");
			await client.post("/api/agents/heartbeat");

			const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(init.body).toBeUndefined();
			expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
		});
	});

	describe("PATCH requests", () => {
		test("sends PATCH with body", async () => {
			mockFetch.mockResolvedValueOnce(mockResponse(200, { status: "running" }));

			const client = new HttpClient("https://bat.hexly.ai", "token");
			await client.patch("/api/agents/agt_123", { status: "running" });

			const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(init.method).toBe("PATCH");
		});
	});

	describe("PUT requests", () => {
		test("sends PUT with body", async () => {
			mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }));

			const client = new HttpClient("https://bat.hexly.ai", "token");
			await client.put("/api/agents/agt_123/tags", { tag_ids: [1, 2] });

			const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(url).toBe("https://bat.hexly.ai/api/agents/agt_123/tags");
			expect(init.method).toBe("PUT");
			const body = JSON.parse(init.body as string);
			expect(body.tag_ids).toEqual([1, 2]);
		});
	});

	describe("DELETE requests", () => {
		test("handles 204 No Content", async () => {
			mockFetch.mockResolvedValueOnce(mockResponse(204));

			const client = new HttpClient("https://bat.hexly.ai", "token");
			const result = await client.delete("/api/agents/agt_123");

			expect(result).toBeUndefined();
		});

		test("handles 200 with JSON body", async () => {
			mockFetch.mockResolvedValueOnce(mockResponse(200, { deleted: true }));

			const client = new HttpClient("https://bat.hexly.ai", "token");
			const result = await client.delete<{ deleted: boolean }>("/api/agents/agt_123");

			expect(result).toEqual({ deleted: true });
		});
	});

	describe("error handling", () => {
		test("throws AuthError on 401", async () => {
			mockFetch.mockResolvedValueOnce(mockResponse(401, { error: "Invalid API key" }));

			const client = new HttpClient("https://bat.hexly.ai", "bad-token");
			try {
				await client.get("/api/agents");
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(AuthError);
				expect((e as AuthError).status).toBe(401);
			}
		});

		test("throws AuthError on 403 (scope insufficient)", async () => {
			mockFetch.mockResolvedValueOnce(
				mockResponse(403, { error: "Token scope insufficient for this route" }),
			);

			const client = new HttpClient("https://bat.hexly.ai", "token");
			try {
				await client.get("/api/hosts");
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(AuthError);
				expect(e).toBeInstanceOf(ApiError);
				expect((e as AuthError).status).toBe(403);
				expect((e as AuthError).message).toBe("Token scope insufficient for this route");
			}
		});

		test("throws AuthError on 403 (invalid key)", async () => {
			mockFetch.mockResolvedValueOnce(mockResponse(403, { error: "Invalid API key" }));

			const client = new HttpClient("https://bat.hexly.ai", "bad-token");
			try {
				await client.get("/api/agents");
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(AuthError);
				expect((e as AuthError).status).toBe(403);
				expect((e as AuthError).message).toBe("Invalid API key");
			}
		});

		test("AuthError has correct status and message for 401", async () => {
			mockFetch.mockResolvedValueOnce(
				mockResponse(401, { error: "Missing or invalid Authorization header" }),
			);

			const client = new HttpClient("https://bat.hexly.ai");
			try {
				await client.get("/api/agents");
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(AuthError);
				expect((e as AuthError).status).toBe(401);
				expect((e as AuthError).message).toBe("Missing or invalid Authorization header");
			}
		});

		test("throws ApiError on 4xx/5xx (not 401/403)", async () => {
			mockFetch.mockResolvedValueOnce(
				mockResponse(400, { error: "source_key must be a non-empty string" }),
			);

			const client = new HttpClient("https://bat.hexly.ai", "token");
			try {
				await client.post("/api/agents/heartbeat", {});
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(ApiError);
				expect(e).not.toBeInstanceOf(AuthError);
				expect((e as ApiError).status).toBe(400);
				expect((e as ApiError).message).toBe("source_key must be a non-empty string");
			}
		});

		test("uses HTTP status when error body is not JSON", async () => {
			mockFetch.mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }));

			const client = new HttpClient("https://bat.hexly.ai", "token");
			try {
				await client.get("/api/agents");
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(ApiError);
				expect((e as ApiError).message).toBe("HTTP 500");
			}
		});

		test("throws NetworkError on fetch failure", async () => {
			mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

			const client = new HttpClient("https://bat.hexly.ai", "token");
			await expect(client.get("/api/agents")).rejects.toThrow(NetworkError);
		});

		test("throws NetworkError on timeout", async () => {
			mockFetch.mockImplementationOnce(
				() =>
					new Promise((_, reject) => {
						setTimeout(() => reject(new DOMException("Aborted", "AbortError")), 10);
					}),
			);

			const client = new HttpClient("https://bat.hexly.ai", "token", 5);
			await expect(client.get("/api/agents")).rejects.toThrow(NetworkError);
		});
	});

	describe("URL handling", () => {
		test("strips trailing slash from base URL", async () => {
			mockFetch.mockResolvedValueOnce(mockResponse(200, []));

			const client = new HttpClient("https://bat.hexly.ai/", "token");
			await client.get("/api/agents");

			const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
			expect(url).toBe("https://bat.hexly.ai/api/agents");
		});
	});
});
