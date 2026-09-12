import type { ConnectToken } from "@bat/shared";
import { afterEach, describe, expect, test, vi } from "vitest";
import { connectDate, connectExamples, connectRequest, connectTokenStatus } from "./connect";

const token: ConnectToken = {
	id: "example",
	name: "Example",
	serverId: "server",
	scope: "read",
	prefix: "masked",
	version: 2,
	createdAt: "2026-01-01T00:00:00Z",
	lastUsedAt: null,
	expiresAt: null,
	revokedAt: null,
};
afterEach(() => vi.unstubAllGlobals());

describe("Connect client privacy and metadata", () => {
	test("management requests disable caches/redirects and send optimistic preconditions", async () => {
		const fetcher = vi.fn().mockImplementation(async () => Response.json({ data: [] }));
		vi.stubGlobal("fetch", fetcher);
		await connectRequest("/api/connect/servers");
		expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
			method: "GET",
			cache: "no-store",
			redirect: "error",
			credentials: "same-origin",
		});
		await connectRequest("/api/connect/token", {
			method: "PATCH",
			token,
			body: { name: "New name" },
		});
		expect(fetcher.mock.calls[1]?.[1].headers).toMatchObject({
			"If-Match": '"example:2"',
			"X-Bat-Management": "1",
			"Content-Type": "application/json",
		});
	});
	test("structured API errors and unavailable sessions are surfaced", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(Response.json({ error: { message: "Confirm again" } }, { status: 403 })),
		);
		await expect(connectRequest("/api/connect/token")).rejects.toThrow("Confirm again");
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("login")));
		await expect(connectRequest("/api/connect/token")).rejects.toThrow("Reload");
	});
	test("expiry and revocation are visible; examples contain only placeholders", () => {
		expect(connectTokenStatus(token)).toBe("Active");
		expect(connectTokenStatus({ ...token, expiresAt: "2020-01-01T00:00:00Z" })).toBe("Expired");
		expect(connectTokenStatus({ ...token, expiresAt: "2099-01-01T00:00:00Z" })).toBe("Active");
		expect(connectTokenStatus({ ...token, revokedAt: "2026-01-01T00:00:00Z" })).toBe("Revoked");
		expect(connectDate(null)).toBe("Never used");
		expect(connectDate(token.createdAt)).toContain("2026");
		expect(connectExamples("https://bat.example/api/v1", "host/id").curl).toContain("host%2Fid");
		expect(connectExamples("https://bat.example/api/v1", "").agent).toContain("SERVER_ID");
		expect(connectExamples("https://bat.example/api/v1", "host").agent).toContain("If-Match");
		expect(connectExamples("https://bat.example/api/v1", "").curl).toContain("--header @-");
	});
});
