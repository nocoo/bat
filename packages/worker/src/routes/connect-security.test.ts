import type { ConnectToken } from "@bat/shared";
import { afterEach, describe, expect, test, vi } from "vitest";
import { D1ConnectRepository } from "../adapters/d1/connect.js";
import { D1ConnectProductsRepository } from "../adapters/d1/connect-products.js";
import { app } from "../index.js";
import { connectFixture, SERVER_A, SERVER_B } from "../test-helpers/connect.js";

vi.mock("jose", () => ({
	createRemoteJWKSet: vi.fn(),
	jwtVerify: vi.fn(async (jwt: string) => {
		if (jwt === "signed-manager") return { payload: { email: "manager@example.invalid" } };
		if (jwt === "signed-limited") return { payload: { email: "limited@example.invalid" } };
		if (jwt === "signed-service") return { payload: { common_name: "fixture-service" } };
		throw new Error("Invalid signature");
	}),
}));
afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("Connect credential lifecycle", () => {
	test("rotation invalidates the old key, revocation deletes ciphertext, and challenge replay fails", async () => {
		const f = await connectFixture();
		const { token, secret } = await f.mint();
		const path = `/api/connect/servers/${SERVER_A}/tokens/${token.id}`;
		const confirmation = async (action: string, row: ConnectToken) =>
			(
				(await (await f.management(`${path}/challenge`, "POST", { action }, row)).json()) as {
					challenge: string;
				}
			).challenge;
		const challenge = await confirmation("rotate", token);
		const rotated = await f.management(
			`${path}/rotate`,
			"POST",
			{ challenge, confirmation: token.name },
			token,
		);
		expect(rotated.status).toBe(200);
		const next = ((await rotated.json()) as { data: ConnectToken }).data;
		expect((await f.call("server.get", secret)).status).toBe(401);
		const nextSecret = await f.reveal(next);
		expect(nextSecret === secret).toBe(false);
		expect((await f.call("server.get", nextSecret)).status).toBe(200);
		const replay = await f.management(
			`${path}/rotate`,
			"POST",
			{ challenge, confirmation: next.name },
			next,
		);
		expect(replay.status).toBe(403);
		const revoke = await confirmation("revoke", next);
		expect(
			(
				await f.management(
					`${path}/revoke`,
					"POST",
					{ challenge: revoke, confirmation: next.name },
					next,
				)
			).status,
		).toBe(200);
		expect((await f.call("server.get", nextSecret)).status).toBe(401);
		const row = await f.db
			.prepare("SELECT ciphertext, version FROM connect_tokens WHERE id = ?")
			.bind(token.id)
			.first<{ ciphertext: string; version: number }>();
		expect(row?.ciphertext).toBe("");
		expect(
			(
				await f.management(
					`${path}/challenge`,
					"POST",
					{ action: "reveal" },
					{ ...next, version: row?.version ?? 0 },
				)
			).status,
		).toBe(409);
	});

	test("confirmation is action/version/expiry bound and metadata updates cannot change scope", async () => {
		const f = await connectFixture();
		const { token } = await f.mint(
			"read",
			SERVER_A,
			new Date(Date.now() + 86400_000).toISOString(),
		);
		const path = `/api/connect/servers/${SERVER_A}/tokens/${token.id}`;
		expect(token.expiresAt).not.toBeNull();
		expect(
			(await f.management(path, "PATCH", { name: "Changed", scope: "write" }, token)).status,
		).toBe(400);
		expect(
			(await f.management(path, "PATCH", { name: "Changed" }, token, { "If-Match": "" })).status,
		).toBe(428);
		expect(
			(await f.management(`${path}/challenge`, "POST", { action: "unknown" }, token)).status,
		).toBe(400);
		const challenge = (
			(await (
				await f.management(`${path}/challenge`, "POST", { action: "reveal" }, token)
			).json()) as { challenge: string }
		).challenge;
		expect(
			(await f.management(`${path}/revoke`, "POST", { challenge, confirmation: token.name }, token))
				.status,
		).toBe(403);
		await f.db.prepare("UPDATE connect_confirmations SET expires_at = unixepoch() - 1").run();
		expect(
			(await f.management(`${path}/reveal`, "POST", { challenge, confirmation: token.name }, token))
				.status,
		).toBe(403);
		const renamed = (
			(await (await f.management(path, "PATCH", { name: "Renamed" }, token)).json()) as {
				data: ConnectToken;
			}
		).data;
		expect(renamed.name).toBe("Renamed");
		expect((await f.management(path, "PATCH", { name: "Stale" }, token)).status).toBe(412);
		expect((await f.reveal(renamed)).startsWith("batc_")).toBe(true);
		expect(
			(
				await f.management(
					`/api/connect/servers/${SERVER_B}/tokens/${token.id}/challenge`,
					"POST",
					{ action: "reveal" },
					token,
				)
			).status,
		).toBe(404);
	});

	test("missing encryption and failed audit never disclose a key", async () => {
		const f = await connectFixture();
		const { token, secret } = await f.mint();
		const path = `/api/connect/servers/${SERVER_A}/tokens/${token.id}`;
		const challenge = (
			(await (
				await f.management(`${path}/challenge`, "POST", { action: "reveal" }, token)
			).json()) as { challenge: string }
		).challenge;
		vi.spyOn(D1ConnectRepository.prototype, "audit").mockRejectedValue(new Error("Unavailable"));
		const response = await f.management(
			`${path}/reveal`,
			"POST",
			{ challenge, confirmation: token.name },
			token,
		);
		expect(response.status).toBe(503);
		expect((await response.text()).includes(secret)).toBe(false);
		vi.restoreAllMocks();
		delete f.env.CONNECT_TOKEN_KEYS;
		expect(
			(
				await f.management(`/api/connect/servers/${SERVER_A}/tokens`, "POST", {
					name: "Missing encryption",
					scope: "read",
				})
			).status,
		).toBe(503);
		delete f.env.CONNECT_DEPLOYMENT_ID;
		expect((await f.call("server.get", secret)).status).toBe(503);
	});

	test("token limit and audited conditional writes are atomic", async () => {
		const f = await connectFixture();
		const { token } = await f.mint();
		await f.db
			.prepare(
				"WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<49) INSERT INTO connect_tokens(id,server_id,name,scope,prefix,token_hash,ciphertext,owner,created_at) SELECT 'limit-'||i,?, 'Limit', 'read', '', 'hash-'||i, '', 'local:developer',unixepoch() FROM n",
			)
			.bind(SERVER_A)
			.run();
		const response = await f.management(`/api/connect/servers/${SERVER_A}/tokens`, "POST", {
			name: "Over limit",
			scope: "read",
		});
		expect(response.status).toBe(422);
		const successful = await f.db
			.prepare(
				"SELECT COUNT(*) AS n FROM connect_audit WHERE operation = 'management.tokens.create' AND status = 201",
			)
			.first<{ n: number }>();
		expect(successful?.n).toBe(1);
		const repo = new D1ConnectRepository(f.db);
		const row = await repo.token(token.id, SERVER_A);
		if (!row) throw new Error("Fixture token missing");
		expect(
			await repo.changeToken(row, 99, {
				id: crypto.randomUUID(),
				request_id: crypto.randomUUID(),
				server_id: SERVER_A,
				token_id: token.id,
				actor: "test",
				operation: "test.conflict",
				status: 200,
				code: null,
				created_at: 1,
			}),
		).toBe(false);
		expect(
			await f.db.prepare("SELECT id FROM connect_audit WHERE operation = 'test.conflict'").first(),
		).toBeNull();
	});
});

describe("Connect Access and request boundaries", () => {
	test("production management needs verified Access plus an active product grant; Bearer never inherits Access", async () => {
		const f = await connectFixture();
		Object.assign(f.env, {
			ENVIRONMENT: "production",
			CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
			CF_ACCESS_AUD: "test-audience",
			CONNECT_MANAGERS: "email:manager@example.invalid",
			CONNECT_COORDINATED: true,
			CONNECT_EDGE_LIMITER: { limit: async () => ({ success: true }) },
			ASSETS: {
				fetch: async () =>
					new Response("<html>Connect</html>", { headers: { "Content-Type": "text/html" } }),
			},
		});
		const browser = (
			path: string,
			jwt = "signed-limited",
			method = "GET",
			body?: unknown,
			row?: ConnectToken,
			headers: Record<string, string> = {},
		) =>
			app.request(
				`https://bat.hexly.ai${path}`,
				{
					method,
					headers: {
						"Cf-Access-Jwt-Assertion": jwt,
						Origin: "https://bat.hexly.ai",
						"X-Bat-Management": "1",
						"Content-Type": "application/json",
						...(row ? { "If-Match": `"${row.id}:${row.version}"` } : {}),
						...headers,
					},
					...(body === undefined ? {} : { body: JSON.stringify(body) }),
				},
				f.env,
			);
		const empty = await browser("/api/connect/servers");
		const discovery = (await empty.json()) as { data: unknown[]; apiBaseUrl: string };
		expect(discovery.data).toHaveLength(0);
		expect(discovery.apiBaseUrl).toBe("https://bat-ingest.worker.hexly.ai/api/v1");
		await f.db
			.prepare(
				"INSERT INTO connect_server_grants(server_id,principal) VALUES (?, 'email:limited@example.invalid')",
			)
			.bind(SERVER_A)
			.run();
		const limited = await browser("/api/connect/servers");
		expect(
			((await limited.json()) as { data: { id: string }[] }).data.map((row) => row.id),
		).toEqual([SERVER_A]);
		expect((await browser(`/api/connect/servers/${SERVER_B}/tokens`)).status).toBe(403);
		expect(
			(await browser(`/api/connect/servers/${SERVER_B}/tokens`, "signed-manager")).status,
		).toBe(200);
		expect((await browser("/api/connect/servers", "forged")).status).toBe(403);
		expect((await browser("/api/connect/servers", "")).status).toBe(401);
		const path = `/api/connect/servers/${SERVER_A}/tokens`;
		const created = await browser(path, "signed-limited", "POST", {
			name: "Limited",
			scope: "read",
		});
		expect(created.status).toBe(201);
		const row = ((await created.json()) as { data: ConnectToken }).data;
		const challenge = (
			(await (
				await browser(
					`${path}/${row.id}/challenge`,
					"signed-limited",
					"POST",
					{ action: "reveal" },
					row,
				)
			).json()) as { challenge: string }
		).challenge;
		const reveal = await browser(
			`${path}/${row.id}/reveal`,
			"signed-limited",
			"POST",
			{ challenge, confirmation: row.name },
			row,
		);
		expect(reveal.status).toBe(200);
		const secret = ((await reveal.json()) as { token: string }).token;
		const bearer = () =>
			app.request(
				`https://bat-ingest.worker.hexly.ai/api/v1/servers/${SERVER_A}`,
				{ headers: { Authorization: `Bearer ${secret}` } },
				f.env,
			);
		expect((await bearer()).status).toBe(200);
		for (const [path, expected] of [
			["/api/v1/capabilities", { baseUrl: discovery.apiBaseUrl }],
			["/api/v1/openapi.json", { servers: [{ url: "https://bat-ingest.worker.hexly.ai" }] }],
		] as const) {
			const response = await app.request(
				`https://bat-ingest.worker.hexly.ai${path}`,
				{ headers: { Authorization: `Bearer ${secret}` } },
				f.env,
			);
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject(expected);
		}
		expect(
			(
				await browser(`/api/v1/servers/${SERVER_A}`, "", "GET", undefined, undefined, {
					Authorization: `Bearer ${secret}`,
				})
			).status,
		).toBe(401);
		expect((await browser("/api/v1/capabilities", "signed-manager")).status).toBe(401);
		expect(
			(
				await browser(path, "signed-limited", "POST", { name: "CSRF", scope: "read" }, undefined, {
					Origin: "",
				})
			).status,
		).toBe(403);
		await f.db.prepare("UPDATE connect_server_grants SET revoked_at = unixepoch()").run();
		expect((await bearer()).status).toBe(403);
		expect(
			(
				await browser(
					`${path}/${row.id}/challenge`,
					"signed-limited",
					"POST",
					{ action: "reveal" },
					row,
				)
			).status,
		).toBe(403);
		const html = await browser("/connect", "signed-manager");
		expect(html.status).toBe(200);
		expect(html.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
		expect(html.headers.get("Cache-Control")).toContain("no-store");
		for (const path of ["/connect", "/api/connect/servers", "/api/auth/request-token"])
			expect(
				(
					await app.request(
						`https://bat-ingest.worker.hexly.ai${path}`,
						{
							headers: {
								"Cf-Access-Jwt-Assertion": "signed-manager",
								Host: "bat.hexly.ai",
							},
						},
						f.env,
					)
				).status,
			).toBe(403);
		expect(
			(
				await app.request(
					"https://unknown.invalid/api/v1/servers",
					{ headers: { Host: "localhost", Authorization: `Bearer ${secret}` } },
					f.env,
				)
			).status,
		).toBe(403);
	});

	test("CORS, CSRF, body type/size, unsupported methods, redaction and request IDs are enforced", async () => {
		const f = await connectFixture();
		const write = await f.mint();
		for (const headers of [
			{ Origin: "https://foreign.invalid" },
			{ "Sec-Fetch-Site": "cross-site" },
		])
			expect(
				(await f.request("/api/v1/capabilities", write.secret, "GET", undefined, headers)).status,
			).toBe(403);
		expect((await f.request("/api/v1/capabilities", write.secret, "OPTIONS")).status).toBe(403);
		expect((await f.request("/api/v1/capabilities", write.secret, "PROPFIND")).status).toBe(400);
		expect(
			(await f.call("assets.create", write.secret, { type: "domain", name: "x".repeat(65537) }))
				.status,
		).toBe(413);
		expect(
			(
				await f.request(
					`/api/v1/servers/${SERVER_A}/assets`,
					write.secret,
					"POST",
					{},
					{ "Content-Type": "text/plain" },
				)
			).status,
		).toBe(415);
		expect(
			(await f.request(`/api/v1/servers/${SERVER_A}/assets`, write.secret, "POST", [])).status,
		).toBe(400);
		const malformed = await app.request(
			`http://localhost/api/v1/servers/${SERVER_A}/assets`,
			{
				method: "POST",
				headers: { Authorization: `Bearer ${write.secret}`, "Content-Type": "application/json" },
				body: "{",
			},
			f.env,
		);
		expect(malformed.status).toBe(400);
		const invalidUtf8 = await app.request(
			`http://localhost/api/v1/servers/${SERVER_A}/assets`,
			{
				method: "POST",
				headers: { Authorization: `Bearer ${write.secret}`, "Content-Type": "application/json" },
				body: new Uint8Array([0xff]),
			},
			f.env,
		);
		expect(invalidUtf8.status).toBe(400);
		const invalid = await f.request("/api/v1/servers", "legacy-write");
		expect(invalid.status).toBe(401);
		expect(invalid.headers.get("WWW-Authenticate")).toContain("Bearer");
		const error = (await invalid.json()) as { error: { requestId: string; code: string } };
		expect(error.error.requestId).toBe(invalid.headers.get("X-Request-Id"));
		expect(error.error.code).toBe("invalid_token");
		expect(invalid.headers.get("Cache-Control")).toContain("no-store");
		const audit = await f.db
			.prepare("SELECT code FROM connect_audit WHERE request_id = ?")
			.bind(error.error.requestId)
			.first<{ code: string }>();
		expect(audit?.code).toBe("invalid_token");
		const misplaced = await f.management(
			`/api/connect/servers/${SERVER_A}/tokens/${write.secret}/challenge`,
			"POST",
			{ action: "reveal" },
			write.token,
		);
		expect(misplaced.status).toBe(404);
		const redacted = await f.db
			.prepare("SELECT * FROM connect_audit WHERE request_id = ?")
			.bind(misplaced.headers.get("X-Request-Id"))
			.first<{ token_id: string }>();
		expect(redacted?.token_id).toBe("[redacted]");
		expect(JSON.stringify(redacted).includes(write.secret)).toBe(false);
	});

	test("edge, token and management rates fail with Retry-After", async () => {
		const f = await connectFixture();
		const read = await f.mint("read");
		f.env.CONNECT_EDGE_LIMITER = { limit: async () => ({ success: false }) };
		const edge = await f.call("server.get", read.secret);
		expect(edge.status).toBe(429);
		expect(edge.headers.get("Retry-After")).toBe("60");
		delete f.env.CONNECT_EDGE_LIMITER;
		await f.db
			.prepare("INSERT INTO connect_rate_windows(key,window,count) VALUES (?, ?,120)")
			.bind(`token:${read.token.id}:read`, Math.floor(Date.now() / 60000))
			.run();
		expect((await f.call("server.get", read.secret)).status).toBe(429);
		await f.db
			.prepare("UPDATE connect_rate_windows SET count = 60 WHERE key LIKE 'manager:%'")
			.run();
		expect((await f.management("/api/connect/servers")).status).toBe(429);
	});

	test("timeouts return structured outcomes and oversize responses are bounded", async () => {
		const f = await connectFixture();
		const read = await f.mint("read");
		vi.spyOn(D1ConnectProductsRepository.prototype, "eventsPage").mockResolvedValueOnce([
			{
				id: 1,
				host_id: SERVER_A,
				hostname: "Alpha",
				title: "Large",
				body: "x".repeat(2_097_153),
				tags: "[]",
				source_ip: "connect",
				created_at: 1,
			},
		]);
		expect((await f.call("events.list", read.secret)).status).toBe(413);
		let release!: () => void;
		let started!: () => void;
		const ready = new Promise<void>((resolve) => {
			started = resolve;
		});
		vi.spyOn(D1ConnectProductsRepository.prototype, "eventsPage").mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = () => resolve([]);
					started();
				}),
		);
		vi.useFakeTimers();
		const pending = f.call("events.list", read.secret);
		await ready;
		await vi.advanceTimersByTimeAsync(15001);
		expect((await pending).status).toBe(504);
		release();
		await vi.advanceTimersByTimeAsync(1);
	});

	test("cursor paging is stable, query-bound, and rejects malformed/cross-resource cursors", async () => {
		const f = await connectFixture();
		const read = await f.mint("read");
		const first = await f.request(`/api/v1/servers/${SERVER_A}/tags?limit=1`, read.secret);
		const page = (await first.json()) as { data: { id: number }[]; page: { nextCursor: string } };
		expect(page.data).toHaveLength(1);
		expect(typeof page.page.nextCursor).toBe("string");
		const second = await f.request(
			`/api/v1/servers/${SERVER_A}/tags?limit=1&cursor=${encodeURIComponent(page.page.nextCursor)}`,
			read.secret,
		);
		const result = (await second.json()) as {
			data: { id: number }[];
			page: { nextCursor: string | null };
		};
		expect(result.data[0]?.id === page.data[0]?.id).toBe(false);
		expect(result.page.nextCursor).toBeNull();
		for (const query of [
			"limit=0",
			"limit=101",
			"cursor=not-json",
			`cursor=${encodeURIComponent(page.page.nextCursor)}&filter=changed`,
		])
			expect(
				(await f.request(`/api/v1/servers/${SERVER_A}/tags?${query}`, read.secret)).status,
			).toBe(400);
		expect(
			(
				await f.request(
					`/api/v1/servers/${SERVER_A}/assets?cursor=${encodeURIComponent(page.page.nextCursor)}`,
					read.secret,
				)
			).status,
		).toBe(400);
		const audit = await f.request(`/api/v1/servers/${SERVER_A}/audit?limit=1`, read.secret);
		const next = ((await audit.json()) as { page: { nextCursor: string } }).page.nextCursor;
		expect(
			(
				await f.request(
					`/api/v1/servers/${SERVER_A}/audit?limit=1&cursor=${encodeURIComponent(next)}`,
					read.secret,
				)
			).status,
		).toBe(200);
	});
});
