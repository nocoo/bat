import type { ConnectToken } from "@bat/shared";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	connectDate,
	connectExamples,
	connectExpiryInput,
	connectRequest,
	connectTokenStatus,
} from "./connect";

const token: ConnectToken = {
	id: "example",
	name: "Example",
	serverIds: ["server", "second-server"],
	scope: "read",
	prefix: "masked",
	version: 2,
	createdAt: "2026-01-01T00:00:00Z",
	lastUsedAt: null,
	expiresAt: null,
	revokedAt: null,
};
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

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
		await connectRequest("/api/connect/tokens/example", {
			method: "PATCH",
			token,
			body: { name: "New name", serverIds: ["server", "third-server"] },
		});
		expect(fetcher.mock.calls[1]?.[1].headers).toMatchObject({
			"If-Match": '"example:2"',
			"X-Bat-Management": "1",
			"Content-Type": "application/json",
		});
		expect(JSON.parse(fetcher.mock.calls[1]?.[1].body)).toEqual({
			name: "New name",
			serverIds: ["server", "third-server"],
		});
	});
	test("an empty server set is sent explicitly and a stale edit is never retried", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValue(
				Response.json(
					{ error: { message: "The token changed. Refresh the list." } },
					{ status: 412 },
				),
			);
		vi.stubGlobal("fetch", fetcher);
		await expect(
			connectRequest("/api/connect/tokens/example", {
				method: "PATCH",
				token,
				body: { serverIds: [] },
			}),
		).rejects.toThrow("The token changed");
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
			body: '{"serverIds":[]}',
			headers: { "If-Match": '"example:2"' },
		});
	});
	test("structured API errors and unavailable sessions are surfaced", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(Response.json({ error: { message: "Confirm again" } }, { status: 403 })),
		);
		await expect(connectRequest("/api/connect/tokens/example")).rejects.toThrow("Confirm again");
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("login")));
		await expect(connectRequest("/api/connect/tokens/example")).rejects.toThrow("Reload");
	});
	test("expiry and revocation are visible; examples contain only placeholders", () => {
		expect(connectTokenStatus(token)).toBe("Active");
		expect(connectTokenStatus({ ...token, expiresAt: "2020-01-01T00:00:00Z" })).toBe("Expired");
		expect(connectTokenStatus({ ...token, expiresAt: "2099-01-01T00:00:00Z" })).toBe("Active");
		expect(connectTokenStatus({ ...token, revokedAt: "2026-01-01T00:00:00Z" })).toBe("Revoked");
		expect(connectDate(null)).toBe("Never used");
		expect(connectDate(token.createdAt)).toContain("2026");
		const examples = connectExamples("https://bat.example/api/v1");
		expect(examples.agent).toContain("GET /servers");
		expect(examples.agent).toContain("SERVER_ID");
		expect(examples.agent).toContain("host_id");
		expect(examples.agent).toContain("If-Match");
		expect(examples.curl).toContain("'https://bat.example/api/v1/servers'");
		expect(examples.curl).toContain("no server access");
		expect(examples.curl).toContain("--header @-");
	});
	test("local expiry inputs preserve seconds, date boundaries and never-expiring values", () => {
		expect(connectExpiryInput(null)).toBe("");
		const offset = vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-480);
		expect(connectExpiryInput("2026-12-31T20:15:37.000Z")).toBe("2027-01-01T04:15:37");
		offset.mockReturnValue(300);
		expect(connectExpiryInput("2027-01-01T02:00:00.000Z")).toBe("2026-12-31T21:00");
	});
});
