import type { WorkstationReportInput } from "@bat/shared";
import { Hono } from "hono";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createD1Repositories } from "../adapters/d1/factory";
import { hashSecret, pkceChallenge } from "../domain/workstation-token";
import { app as publicApp } from "../index";
import { workstationKeyAuth } from "../middleware/workstation";
import { createMockD1 } from "../test-helpers/mock-d1";
import type { AppEnv, Bindings } from "../types";
import { workstationAuthorizeRoute, workstationExchangeRoute } from "./workstation-auth";
import {
	workstationReportRoute,
	workstationRevokeRoute,
	workstationTargetsRoute,
} from "./workstation-probe";
import {
	workstationConnectivityRoute,
	workstationDeleteRoute,
	workstationDetailRoute,
	workstationMetricsRoute,
	workstationsListRoute,
} from "./workstations";

const ORIGIN = "http://localhost";
const OWNER = "email:operator@example.test";
const OTHER_OWNER = "email:other@example.test";
const INSTALLATION = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const VERIFIER = "v".repeat(64);
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

interface Harness {
	app: Hono<AppEnv>;
	db: D1Database;
	env: Bindings;
	request(
		path: string,
		options?: { method?: string; body?: unknown; headers?: Record<string, string> },
	): Promise<Response>;
	enroll(options?: { owner?: string; disabled?: boolean }): Promise<{ id: string; token: string }>;
	registerHost(hostId: string, publicIp: string | null, active?: boolean): Promise<void>;
	report(
		reportId: string,
		connectivity?: WorkstationReportInput["connectivity"],
	): WorkstationReportInput;
}

function harness(envOverrides: Partial<Bindings> = {}, access = true): Harness {
	const db = createMockD1();
	const repos = createD1Repositories(db);
	const env = {
		DB: db,
		ENVIRONMENT: "development",
		BAT_WRITE_KEY: "write-key",
		BAT_READ_KEY: "read-key",
		CONNECT_MANAGERS: OWNER,
		WORKSTATION_RATE_LIMIT: "6000",
		...envOverrides,
	} as Bindings;
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.env = env;
		c.set("repos", repos);
		if (access) {
			c.set("accessAuthenticated", true);
			c.set("accessPrincipal", c.req.header("Test-Principal") ?? OWNER);
		}
		await next();
	});
	app.use("/api/workstation-probe/*", workstationKeyAuth);
	app.post("/api/workstation-auth/authorize", workstationAuthorizeRoute);
	app.post("/api/workstation-auth/exchange", workstationExchangeRoute);
	app.get("/api/workstation-probe/targets", workstationTargetsRoute);
	app.post("/api/workstation-probe/reports", workstationReportRoute);
	app.post("/api/workstation-probe/revoke", workstationRevokeRoute);
	app.get("/api/workstations", workstationsListRoute);
	app.get("/api/workstations/:id/metrics", workstationMetricsRoute);
	app.get("/api/workstations/:id/connectivity", workstationConnectivityRoute);
	app.get("/api/workstations/:id", workstationDetailRoute);
	app.delete("/api/workstations/:id", workstationDeleteRoute);

	async function registerHost(
		hostId: string,
		publicIp: string | null,
		active = true,
	): Promise<void> {
		await db
			.prepare(
				"INSERT INTO hosts(host_id, hostname, last_seen, public_ip, is_active) VALUES (?,?,?,?,?)",
			)
			.bind(hostId, `${hostId}.example.com`, nowSeconds(), publicIp, active ? 1 : 0)
			.run();
	}

	async function enroll(
		options: { owner?: string; disabled?: boolean; installationId?: string } = {},
	) {
		const owner = options.owner ?? OWNER;
		const installationId = options.installationId ?? INSTALLATION;
		const code = `code-${Math.random().toString(36).slice(2)}`;
		await repos.workstations.createCode({
			code_hash: await hashSecret(code),
			owner,
			installation_id: installationId,
			challenge: await pkceChallenge(VERIFIER),
			name: "Li MacBook",
			created_at: nowSeconds(),
			expires_at: nowSeconds() + 300,
			consumed_at: null,
		});
		const response = await app.request(`${ORIGIN}/api/workstation-auth/exchange`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				code,
				code_verifier: "v".repeat(64),
				installation_id: installationId,
			}),
		});
		const body = (await response.json()) as { workstation_id: string; token: string };
		if (options.disabled) {
			await db
				.prepare("UPDATE workstations SET disabled = 1 WHERE id = ?")
				.bind(body.workstation_id)
				.run();
		}
		return { id: body.workstation_id, token: body.token };
	}

	return {
		app,
		db,
		env,
		request(path, options = {}) {
			return app.request(`${ORIGIN}${path}`, {
				method: options.method ?? "GET",
				headers: {
					...(options.method && options.method !== "GET"
						? { Origin: ORIGIN, "X-Bat-Management": "1", "Content-Type": "application/json" }
						: {}),
					...options.headers,
				},
				...(options.body === undefined
					? {}
					: {
							body: typeof options.body === "string" ? options.body : JSON.stringify(options.body),
						}),
			});
		},
		enroll,
		registerHost,
		report(reportId, connectivity = []) {
			const finished = nowSeconds();
			return {
				report_id: reportId,
				started_at: finished - 10,
				finished_at: finished,
				sample_window_ms: 10_000,
				cli_version: "2.5.0",
				hostname: "laptop-01",
				os: "macOS 15.2",
				arch: "arm64",
				uptime_seconds: 86_400,
				cpu: { model: "Apple M3 Pro", count: 12, usage_pct: 12.5 },
				mem: {
					total_bytes: 36_000_000_000,
					available_bytes: 12_000_000_000,
					used_pct: 66.7,
				},
				disk: [
					{
						mount: "/",
						total_bytes: 994_662_584_320,
						available_bytes: 397_284_917_248,
						used_pct: 60.1,
					},
				],
				network: { interfaces: [{ name: "en0", addresses: [] }] },
				connectivity,
				collection_errors: [],
				targets_error: null,
			};
		},
	};
}

function uuid(index: number): string {
	return `3f2504e0-4f89-41d3-9a0c-${index.toString(16).padStart(12, "0")}`;
}

function auth(token: string): Record<string, string> {
	return { Authorization: `Bearer ${token}` };
}

describe("workstation authorize", () => {
	test("requires a verified Access session", async () => {
		const h = harness({}, false);
		const response = await h.request("/api/workstation-auth/authorize", {
			method: "POST",
			body: {},
		});
		expect(response.status).toBe(403);
	});

	test("refuses a non-human principal", async () => {
		const h = harness();
		const response = await h.request("/api/workstation-auth/authorize", {
			method: "POST",
			headers: { "Test-Principal": "service:ci" },
			body: { installation_id: INSTALLATION },
		});
		expect(response.status).toBe(403);
	});

	test.each([{ Origin: "https://evil.example" }, { "X-Bat-Management": "0" }])(
		"requires the same-origin management confirmation: %s",
		async (headers) => {
			const h = harness();
			const response = await h.app.request(`${ORIGIN}/api/workstation-auth/authorize`, {
				method: "POST",
				headers: {
					Origin: ORIGIN,
					"X-Bat-Management": "1",
					"Content-Type": "application/json",
					...headers,
				},
				body: JSON.stringify({}),
			});
			expect(response.status).toBe(403);
		},
	);

	test("mints a code-bound redirect and never stores the plaintext code", async () => {
		const h = harness();
		const response = await h.request("/api/workstation-auth/authorize", {
			method: "POST",
			body: {
				installation_id: INSTALLATION,
				code_challenge: CHALLENGE,
				code_challenge_method: "S256",
				state: "s".repeat(32),
				callback: "http://127.0.0.1:8765/callback",
				name: "Li MacBook",
			},
		});
		expect(response.status).toBe(201);
		const body = (await response.json()) as { redirect_url: string };
		const redirect = new URL(body.redirect_url);
		expect(redirect.origin).toBe("http://127.0.0.1:8765");
		expect(redirect.pathname).toBe("/callback");
		expect(redirect.searchParams.get("state")).toBe("s".repeat(32));
		const code = redirect.searchParams.get("code") ?? "";
		expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
		const stored = await h.db
			.prepare("SELECT code_hash FROM workstation_codes")
			.all<{ code_hash: string }>();
		expect(stored.results.map((row) => row.code_hash)).toEqual([await hashSecret(code)]);
	});

	test("rejects a non-JSON authorize body", async () => {
		const h = harness();
		const response = await h.app.request(`${ORIGIN}/api/workstation-auth/authorize`, {
			method: "POST",
			headers: { Origin: ORIGIN, "X-Bat-Management": "1", "Content-Type": "text/plain" },
			body: "code",
		});
		expect(response.status).toBe(415);
	});

	test("rejects an invalid authorize body", async () => {
		const h = harness();
		const response = await h.request("/api/workstation-auth/authorize", {
			method: "POST",
			body: {
				installation_id: "not-a-uuid",
				code_challenge: CHALLENGE,
				code_challenge_method: "S256",
				state: "s".repeat(32),
				callback: "http://127.0.0.1:8765/callback",
			},
		});
		expect(response.status).toBe(400);
	});

	test("rate limits enrollment attempts", async () => {
		const h = harness({ WORKSTATION_RATE_LIMIT: "1" });
		const body = {
			installation_id: INSTALLATION,
			code_challenge: CHALLENGE,
			code_challenge_method: "S256",
			state: "s".repeat(32),
			callback: "http://127.0.0.1:8765/callback",
		};
		expect(
			(await h.request("/api/workstation-auth/authorize", { method: "POST", body })).status,
		).toBe(201);
		expect(
			(await h.request("/api/workstation-auth/authorize", { method: "POST", body })).status,
		).toBe(429);
	});
});

describe("workstation exchange", () => {
	async function codeRow(h: Harness, options: { owner?: string; expiresIn?: number } = {}) {
		const code = `exchange-${Math.random().toString(36).slice(2)}`;
		await h.db
			.prepare(
				"INSERT INTO workstation_codes(code_hash, owner, installation_id, challenge, name, created_at, expires_at, consumed_at) VALUES (?,?,?,?,?,?,?,NULL)",
			)
			.bind(
				await hashSecret(code),
				options.owner ?? OWNER,
				INSTALLATION,
				await pkceChallenge(VERIFIER),
				"Li MacBook",
				nowSeconds(),
				nowSeconds() + (options.expiresIn ?? 300),
			)
			.run();
		return code;
	}

	function body(code: string, overrides: Record<string, unknown> = {}) {
		return { code, code_verifier: VERIFIER, installation_id: INSTALLATION, ...overrides };
	}

	test("issues a batw_ key and stores only its digest", async () => {
		const h = harness();
		const code = await codeRow(h);
		const response = await h.request("/api/workstation-auth/exchange", {
			method: "POST",
			body: body(code),
		});
		expect(response.status).toBe(200);
		const issued = (await response.json()) as {
			workstation_id: string;
			token: string;
			worker_url: string;
		};
		expect(issued.token).toMatch(/^batw_[A-Za-z0-9_-]{43}$/);
		expect(issued.worker_url).toBe(ORIGIN);
		const rows = await h.db
			.prepare("SELECT id, token_hash FROM workstations")
			.all<{ id: string; token_hash: string }>();
		expect(rows.results).toEqual([
			{ id: issued.workstation_id, token_hash: await hashSecret(issued.token) },
		]);
		expect(JSON.stringify(rows.results)).not.toContain(issued.token);
	});

	test("a code is single-use", async () => {
		const h = harness();
		const code = await codeRow(h);
		expect(
			(await h.request("/api/workstation-auth/exchange", { method: "POST", body: body(code) }))
				.status,
		).toBe(200);
		const replay = await h.request("/api/workstation-auth/exchange", {
			method: "POST",
			body: body(code),
		});
		expect(replay.status).toBe(401);
	});

	test("rejects an expired code, a wrong verifier and a foreign installation", async () => {
		const h = harness();
		const expired = await codeRow(h, { expiresIn: -5 });
		expect(
			(await h.request("/api/workstation-auth/exchange", { method: "POST", body: body(expired) }))
				.status,
		).toBe(401);
		const code = await codeRow(h, { owner: OWNER });
		expect(
			(
				await h.request("/api/workstation-auth/exchange", {
					method: "POST",
					body: body(code, { code_verifier: "w".repeat(64) }),
				})
			).status,
		).toBe(401);
		expect(
			(
				await h.request("/api/workstation-auth/exchange", {
					method: "POST",
					body: body(code, { installation_id: uuid(9) }),
				})
			).status,
		).toBe(401);
		expect(
			(await h.request("/api/workstation-auth/exchange", { method: "POST", body: body("unknown") }))
				.status,
		).toBe(401);
	});

	test("rejects a disabled or foreign workstation", async () => {
		const disabled = harness();
		const code = await codeRow(disabled);
		const first = (await (
			await disabled.request("/api/workstation-auth/exchange", { method: "POST", body: body(code) })
		).json()) as { workstation_id: string; token: string };
		await disabled.db
			.prepare("UPDATE workstations SET disabled = 1 WHERE id = ?")
			.bind(first.workstation_id)
			.run();
		const again = await codeRow(disabled);
		expect(
			(
				await disabled.request("/api/workstation-auth/exchange", {
					method: "POST",
					body: body(again),
				})
			).status,
		).toBe(403);

		const foreign = harness();
		await foreign.enroll();
		const foreignCode = await codeRow(foreign, { owner: OTHER_OWNER });
		expect(
			(
				await foreign.request("/api/workstation-auth/exchange", {
					method: "POST",
					body: body(foreignCode),
				})
			).status,
		).toBe(409);
	});

	test.each([
		["missing verifier", { code_verifier: undefined }, 400],
		["short verifier", { code_verifier: "short" }, 400],
		["invalid installation", { installation_id: "install" }, 400],
		["null body", null, 400],
	])("rejects %s", async (_name, overrides, status) => {
		const h = harness();
		const response = await h.request("/api/workstation-auth/exchange", {
			method: "POST",
			body: overrides === null ? "null" : body("code", overrides),
		});
		expect(response.status).toBe(status);
	});

	test("bounds the body and requires JSON", async () => {
		const h = harness();
		const notJson = await h.app.request(`${ORIGIN}/api/workstation-auth/exchange`, {
			method: "POST",
			headers: { "Content-Type": "text/plain" },
			body: "code",
		});
		expect(notJson.status).toBe(415);
		const tooLarge = await h.app.request(`${ORIGIN}/api/workstation-auth/exchange`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code: "c".repeat(70_000) }),
		});
		expect(tooLarge.status).toBe(413);
		const noContentType = await h.app.request(`${ORIGIN}/api/workstation-auth/exchange`, {
			method: "POST",
			body: new Uint8Array([123, 125]),
		});
		expect(noContentType.status).toBe(415);
		const invalidJson = await h.app.request(`${ORIGIN}/api/workstation-auth/exchange`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{",
		});
		expect(invalidJson.status).toBe(400);
		const empty = await h.app.request(`${ORIGIN}/api/workstation-auth/exchange`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "",
		});
		expect(empty.status).toBe(400);
		const invalidUtf8 = await h.app.request(`${ORIGIN}/api/workstation-auth/exchange`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: new Uint8Array([0xff, 0xfe]),
		});
		expect(invalidUtf8.status).toBe(400);
	});

	test("rejects a request without a body", async () => {
		const h = harness();
		const response = await h.app.request(`${ORIGIN}/api/workstation-auth/exchange`, {
			method: "POST",
		});
		expect(response.status).toBe(400);
	});

	test("a same-second replay is rejected and never rotates the first credential", async () => {
		const h = harness();
		const code = await codeRow(h);
		const first = await h.request("/api/workstation-auth/exchange", {
			method: "POST",
			body: body(code),
		});
		expect(first.status).toBe(200);
		const issued = (await first.json()) as { token: string };
		const replay = await h.request("/api/workstation-auth/exchange", {
			method: "POST",
			body: body(code),
		});
		expect(replay.status).toBe(401);
		// The first credential still authenticates: the batch guard depends on
		// this attempt's consume marker, not on the same-second timestamp.
		expect(
			(await h.request("/api/workstation-probe/targets", { headers: auth(issued.token) })).status,
		).toBe(200);
	});

	test("a code consumed between read and exchange is rejected without rotating the key", async () => {
		const h = harness();
		const code = await codeRow(h);
		const repos = createD1Repositories(h.db);
		const first = await h.app.request(`${ORIGIN}/api/workstation-auth/exchange`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body(code)),
		});
		const issued = (await first.json()) as { token: string };
		const stale = await repos.workstations.getCode(await hashSecret(code));
		vi.spyOn(repos.workstations, "getCode").mockResolvedValue(
			stale === null ? null : { ...stale, consumed_at: null },
		);
		const isolated = new Hono<AppEnv>();
		isolated.use("*", async (c, next) => {
			c.env = h.env;
			c.set("repos", repos);
			await next();
		});
		isolated.post("/api/workstation-auth/exchange", workstationExchangeRoute);
		const response = await isolated.request(`${ORIGIN}/api/workstation-auth/exchange`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body(code)),
		});
		expect(response.status).toBe(401);
		expect(
			(await h.request("/api/workstation-probe/targets", { headers: auth(issued.token) })).status,
		).toBe(200);
	});

	test("expires a stalled body upload", async () => {
		vi.useFakeTimers();
		try {
			const h = harness();
			const stalled = new Request(`${ORIGIN}/api/workstation-auth/exchange`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: new ReadableStream({ cancel: () => undefined }),
				duplex: "half",
			} as RequestInit & { duplex: "half" });
			const pending = h.app.request(stalled);
			await vi.advanceTimersByTimeAsync(5_000);
			expect((await pending).status).toBe(504);
		} finally {
			vi.useRealTimers();
		}
	});

	test("rate limits exchange attempts", async () => {
		const h = harness({ WORKSTATION_RATE_LIMIT: "1" });
		const code = await codeRow(h);
		expect(
			(await h.request("/api/workstation-auth/exchange", { method: "POST", body: body(code) }))
				.status,
		).toBe(200);
		expect(
			(await h.request("/api/workstation-auth/exchange", { method: "POST", body: body("x") }))
				.status,
		).toBe(429);
	});
});

describe("workstation probe authentication", () => {
	test.each([
		["no key", {}],
		["write key", { Authorization: "Bearer write-key" }],
		["read key", { Authorization: "Bearer read-key" }],
		["malformed bearer", { Authorization: "Bearer nope" }],
		["unknown batw_ key", { Authorization: `Bearer batw_${"a".repeat(43)}` }],
	])("rejects %s", async (_name, headers) => {
		const h = harness();
		const response = await h.request("/api/workstation-probe/targets", { headers });
		expect(response.status).toBe(401);
	});

	test("rejects a disabled workstation key", async () => {
		const h = harness();
		const { token } = await h.enroll({ disabled: true });
		const response = await h.request("/api/workstation-probe/targets", { headers: auth(token) });
		expect(response.status).toBe(403);
	});

	test("probe handlers refuse to run without an authenticated key", async () => {
		const h = harness();
		const repos = createD1Repositories(h.db);
		const isolated = new Hono<AppEnv>();
		isolated.use("*", async (c, next) => {
			c.env = h.env;
			c.set("repos", repos);
			await next();
		});
		isolated.get("/api/workstation-probe/targets", workstationTargetsRoute);
		isolated.post("/api/workstation-probe/reports", workstationReportRoute);
		expect((await isolated.request(`${ORIGIN}/api/workstation-probe/targets`)).status).toBe(401);
		expect(
			(
				await isolated.request(`${ORIGIN}/api/workstation-probe/reports`, {
					method: "POST",
					body: "{}",
				})
			).status,
		).toBe(401);
	});

	test("the public app keeps static keys out of the workstation chain", async () => {
		const h = harness();
		const response = await publicApp.request(
			`${ORIGIN}/api/workstation-probe/targets`,
			{ headers: { Authorization: "Bearer write-key" } },
			h.env,
		);
		expect(response.status).toBe(401);
		const authorize = await publicApp.request(
			`${ORIGIN}/api/workstation-auth/authorize`,
			{ method: "POST" },
			h.env,
		);
		expect(authorize.status).toBe(403);
	});
});

describe("workstation targets and reports", () => {
	async function enrolled(h: Harness, servers: Array<[string, string | null, boolean?]>) {
		for (const [hostId, publicIp, active] of servers) {
			await h.registerHost(hostId, publicIp, active ?? true);
		}
		return h.enroll();
	}

	test("targets only expose active public servers", async () => {
		const h = harness();
		const { token } = await enrolled(h, [
			["srv-01", "8.8.8.8"],
			["srv-02", "2001:4860:4860::8888"],
			["srv-private", "10.0.0.5"],
			["srv-retired", "9.9.9.9", false],
		]);
		const response = await h.request("/api/workstation-probe/targets", { headers: auth(token) });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			data: [
				{
					server_id: "srv-01",
					name: "srv-01.example.com",
					address: "8.8.8.8",
					family: 4,
				},
				{
					server_id: "srv-02",
					name: "srv-02.example.com",
					address: "2001:4860:4860::8888",
					family: 6,
				},
			],
			interval_seconds: 600,
			ping_count: 3,
		});
	});

	test("targets are empty when the owner has no authorized servers", async () => {
		const h = harness({ CONNECT_MANAGERS: OTHER_OWNER });
		const { token } = await enrolled(h, [["srv-01", "8.8.8.8"]]);
		const response = await h.request("/api/workstation-probe/targets", { headers: auth(token) });
		expect((await response.json()) as { data: unknown[] }).toMatchObject({ data: [] });
	});

	test("accepts a matching report, then reports duplicates and conflicts", async () => {
		const h = harness();
		const { token } = await enrolled(h, [["srv-01", "8.8.8.8"]]);
		const report = h.report(uuid(1), [
			{
				server_id: "srv-01",
				address: "8.8.8.8",
				family: 4,
				sent: 3,
				received: 3,
				rtts_ms: [8, 9, 10],
				status: "reachable",
			},
		]);
		const first = await h.request("/api/workstation-probe/reports", {
			method: "POST",
			headers: auth(token),
			body: report,
		});
		expect(first.status).toBe(200);
		expect(await first.json()).toMatchObject({ status: "accepted", duplicate: false });
		const duplicate = await h.request("/api/workstation-probe/reports", {
			method: "POST",
			headers: auth(token),
			body: report,
		});
		expect(await duplicate.json()).toMatchObject({ status: "accepted", duplicate: true });
		const conflict = await h.request("/api/workstation-probe/reports", {
			method: "POST",
			headers: auth(token),
			body: { ...report, hostname: "renamed" },
		});
		expect(conflict.status).toBe(409);
	});

	test("a duplicate report never refreshes liveness, the public address or the latest snapshot", async () => {
		// Production observes the platform address and always uses the fixed
		// per-minute budget, so this scenario stays within two uploads.
		const h = harness({ ENVIRONMENT: "production" });
		const { id, token } = await enrolled(h, [["srv-01", "8.8.8.8"]]);
		const report = h.report(uuid(1), [
			{
				server_id: "srv-01",
				address: "8.8.8.8",
				family: 4,
				sent: 3,
				received: 0,
				rtts_ms: [null, null, null],
				status: "timeout",
			},
		]);
		expect(
			(
				await h.request("/api/workstation-probe/reports", {
					method: "POST",
					headers: { ...auth(token), "CF-Connecting-IP": "8.8.8.8" },
					body: report,
				})
			).status,
		).toBe(200);
		const before = (await (await h.request(`/api/workstations/${id}`)).json()) as {
			last_seen_at: number;
			public_ip: string | null;
			latest_report: { report_id: string } | null;
		};
		const duplicate = await h.request("/api/workstation-probe/reports", {
			method: "POST",
			headers: { ...auth(token), "CF-Connecting-IP": "1.1.1.1" },
			body: report,
		});
		expect(duplicate.status).toBe(200);
		expect(await duplicate.json()).toMatchObject({ duplicate: true });
		const after = (await (await h.request(`/api/workstations/${id}`)).json()) as typeof before;
		expect(after).toEqual(before);
		expect(after.public_ip).toBe("8.8.8.8");
	});

	test("a late older sample stays in history without moving liveness or the latest snapshot", async () => {
		const h = harness({ ENVIRONMENT: "production" });
		const { id, token } = await enrolled(h, [["srv-01", "8.8.8.8"]]);
		const newer = h.report(uuid(2));
		await h.request("/api/workstation-probe/reports", {
			method: "POST",
			headers: { ...auth(token), "CF-Connecting-IP": "8.8.8.8" },
			body: newer,
		});
		const before = (await (await h.request(`/api/workstations/${id}`)).json()) as {
			last_seen_at: number;
			public_ip: string | null;
			latest_report: { report_id: string } | null;
		};
		const older = {
			...newer,
			report_id: uuid(1),
			// Older than the accepted sample but still inside the 300 s skew window.
			finished_at: newer.finished_at - 120,
			started_at: newer.started_at - 120,
		};
		expect(
			(
				await h.request("/api/workstation-probe/reports", {
					method: "POST",
					headers: { ...auth(token), "CF-Connecting-IP": "9.9.9.9" },
					body: older,
				})
			).status,
		).toBe(200);
		const after = (await (await h.request(`/api/workstations/${id}`)).json()) as typeof before;
		expect(after.latest_report?.report_id).toBe(uuid(2));
		expect(after.last_seen_at).toBe(before.last_seen_at);
		expect(after.public_ip).toBe("8.8.8.8");
		const metrics = (await (
			await h.request(`/api/workstations/${id}/metrics?limit=10`)
		).json()) as { data: unknown[] };
		expect(metrics.data).toHaveLength(2);
	});

	test("distinct servers sharing one public address are accepted", async () => {
		const h = harness();
		const { token } = await enrolled(h, [
			["srv-01", "8.8.8.8"],
			["srv-02", "8.8.8.8"],
		]);
		const shared = [
			{
				server_id: "srv-01",
				address: "8.8.8.8",
				family: 4,
				sent: 3,
				received: 3,
				rtts_ms: [8, 9, 10],
				status: "reachable",
			},
			{
				server_id: "srv-02",
				address: "8.8.8.8",
				family: 4,
				sent: 3,
				received: 0,
				rtts_ms: [null, null, null],
				status: "timeout",
			},
		] as unknown as WorkstationReportInput["connectivity"];
		const response = await h.request("/api/workstation-probe/reports", {
			method: "POST",
			headers: auth(token),
			body: h.report(uuid(1), shared),
		});
		expect(response.status).toBe(200);
		const { id } = await h.enroll();
		expect(id).toBeTruthy();
	});

	test("report IDs are scoped per workstation", async () => {
		const h = harness();
		const first = await enrolled(h, []);
		const second = await h.enroll({ installationId: uuid(9) });
		for (const key of [first.token, second.token]) {
			expect(
				(
					await h.request("/api/workstation-probe/reports", {
						method: "POST",
						headers: auth(key),
						body: h.report(uuid(7)),
					})
				).status,
			).toBe(200);
		}
		for (const id of [first.id, second.id]) {
			const record = (await (await h.request(`/api/workstations/${id}`)).json()) as {
				latest_report: { report_id: string };
			};
			expect(record.latest_report.report_id).toBe(uuid(7));
		}
	});

	test("rejects targets outside the current authorization or with a different address", async () => {
		const h = harness();
		const { token } = await enrolled(h, [["srv-01", "8.8.8.8"]]);
		const entry = {
			server_id: "srv-01",
			address: "8.8.8.8",
			family: 4,
			sent: 3,
			received: 0,
			rtts_ms: [null, null, null],
			status: "timeout",
		};
		for (const connectivity of [
			[{ ...entry, server_id: "srv-unknown" }],
			[{ ...entry, address: "8.8.4.4" }],
			[{ ...entry, address: "2001:4860:4860::9999", family: 6 }],
		]) {
			const response = await h.request("/api/workstation-probe/reports", {
				method: "POST",
				headers: auth(token),
				body: h.report(uuid(2), connectivity as WorkstationReportInput["connectivity"]),
			});
			expect(response.status).toBe(403);
		}
	});

	test("rejects an invalid report body and a disabled workstation", async () => {
		const h = harness();
		const { token } = await enrolled(h, [["srv-01", "8.8.8.8"]]);
		const invalid = await h.request("/api/workstation-probe/reports", {
			method: "POST",
			headers: auth(token),
			body: { ...h.report(uuid(1)), report_id: "nope" },
		});
		expect(invalid.status).toBe(400);
		await h.db.prepare("UPDATE workstations SET disabled = 1").run();
		const disabled = await h.request("/api/workstation-probe/reports", {
			method: "POST",
			headers: auth(token),
			body: h.report(uuid(1)),
		});
		expect(disabled.status).toBe(403);
	});

	test("rejects a non-JSON or oversized report body", async () => {
		const h = harness();
		const { token } = await enrolled(h, []);
		const notJson = await h.app.request(`${ORIGIN}/api/workstation-probe/reports`, {
			method: "POST",
			headers: { ...auth(token), "Content-Type": "text/plain" },
			body: "report",
		});
		expect(notJson.status).toBe(415);
		const tooLarge = await h.app.request(`${ORIGIN}/api/workstation-probe/reports`, {
			method: "POST",
			headers: { ...auth(token), "Content-Type": "application/json" },
			body: JSON.stringify({ padding: "p".repeat(70_000) }),
		});
		expect(tooLarge.status).toBe(413);
	});

	test("answers 403 when the workstation is disabled after authentication", async () => {
		const h = harness();
		const repos = createD1Repositories(h.db);
		const { token } = await enrolled(h, []);
		const row = await repos.workstations.findByTokenHash(await hashSecret(token));
		if (!row) throw new Error("missing workstation row");
		await h.db.prepare("UPDATE workstations SET disabled = 1").run();
		const isolated = new Hono<AppEnv>();
		isolated.use("*", async (c, next) => {
			c.env = h.env;
			c.set("repos", repos);
			c.set("workstation", row);
			await next();
		});
		isolated.post("/api/workstation-probe/reports", workstationReportRoute);
		const response = await isolated.request(`${ORIGIN}/api/workstation-probe/reports`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(h.report(uuid(3))),
		});
		expect(response.status).toBe(403);
	});

	test("answers 503 when target authority cannot be verified", async () => {
		const h = harness();
		const { token } = await enrolled(h, [["srv-01", "8.8.8.8"]]);
		const repos = createD1Repositories(h.db);
		vi.spyOn(repos.connect, "servers").mockRejectedValue(new Error("D1 unavailable"));
		const isolated = new Hono<AppEnv>();
		isolated.use("*", async (c, next) => {
			c.env = h.env;
			c.set("repos", repos);
			c.set("workstation", await repos.workstations.findByTokenHash(await hashSecret(token)));
			await next();
		});
		isolated.post("/api/workstation-probe/reports", workstationReportRoute);
		const response = await isolated.request(`${ORIGIN}/api/workstation-probe/reports`, {
			method: "POST",
			headers: { "Content-Type": "application/json", ...auth(token) },
			body: JSON.stringify(h.report(uuid(1))),
		});
		expect(response.status).toBe(503);
	});

	test("records the platform address only in production", async () => {
		for (const [environment, expected] of [
			["production", "8.8.8.8"],
			["production", null],
			["development", null],
		] as const) {
			const h = harness({ ENVIRONMENT: environment });
			const { token } = await enrolled(h, [["srv-01", "8.8.8.8"]]);
			const headers = {
				...auth(token),
				...(expected ? { "CF-Connecting-IP": expected } : { "CF-Connecting-IP": "10.0.0.1" }),
			};
			await h.request("/api/workstation-probe/reports", {
				method: "POST",
				headers,
				body: h.report(uuid(1)),
			});
			const row = await h.db
				.prepare("SELECT public_ip FROM workstations")
				.first<{ public_ip: string | null }>();
			expect(row?.public_ip).toBe(expected);
		}
	});

	test("rate limits probe calls", async () => {
		const h = harness({ WORKSTATION_RATE_LIMIT: "1" });
		const { token } = await enrolled(h, []);
		expect(
			(await h.request("/api/workstation-probe/targets", { headers: auth(token) })).status,
		).toBe(200);
		expect(
			(await h.request("/api/workstation-probe/targets", { headers: auth(token) })).status,
		).toBe(429);
		const report = await h.request("/api/workstation-probe/reports", {
			method: "POST",
			headers: auth(token),
			body: h.report(uuid(1)),
		});
		expect(report.status).toBe(200);
		expect(
			(
				await h.request("/api/workstation-probe/reports", {
					method: "POST",
					headers: auth(token),
					body: h.report(uuid(2)),
				})
			).status,
		).toBe(429);
	});
});

describe("workstation browser reads and revocation", () => {
	test("lists and reads records with derived status inputs", async () => {
		const h = harness();
		const { id, token } = await h.enroll();
		await h.request("/api/workstation-probe/reports", {
			method: "POST",
			headers: auth(token),
			body: h.report(uuid(1)),
		});
		const list = await h.request("/api/workstations");
		expect(list.status).toBe(200);
		expect(await list.json()).toMatchObject([
			{ id, owner: OWNER, disabled: false, latest_report: { report_id: uuid(1) } },
		]);
		expect((await h.request(`/api/workstations/${id}`)).status).toBe(200);
		expect((await h.request(`/api/workstations/${uuid(99)}`)).status).toBe(404);
	});

	test("serves bounded metrics and connectivity history", async () => {
		const h = harness();
		const { id, token } = await h.enroll();
		await h.registerHost("srv-01", "8.8.8.8");
		await h.request("/api/workstation-probe/reports", {
			method: "POST",
			headers: auth(token),
			body: h.report(uuid(1), [
				{
					server_id: "srv-01",
					address: "8.8.8.8",
					family: 4,
					sent: 3,
					received: 1,
					rtts_ms: [0, null, null],
					status: "partial",
				},
			]),
		});
		const metrics = await h.request(`/api/workstations/${id}/metrics?limit=1&offset=0`);
		expect(metrics.status).toBe(200);
		const metricsBody = (await metrics.json()) as {
			data: Array<{ cpu_usage_pct: number }>;
			page: { limit: number; offset: number; next_offset: number | null };
		};
		expect(metricsBody.data).toHaveLength(1);
		expect(metricsBody.page).toEqual({ limit: 1, offset: 0, next_offset: 1 });
		const partial = await h.request(`/api/workstations/${id}/metrics?limit=5`);
		expect(((await partial.json()) as { page: { next_offset: number | null } }).page).toEqual({
			limit: 5,
			offset: 0,
			next_offset: null,
		});
		const connectivity = await h.request(`/api/workstations/${id}/connectivity`);
		expect(await connectivity.json()).toMatchObject({
			limit: 100,
			targets: [
				{
					server_id: "srv-01",
					address: "8.8.8.8",
					family: 4,
					data: [{ received: 1, rtt_avg_ms: 0, rtt_min_ms: 0, rtt_max_ms: 0 }],
				},
			],
		});
	});

	test("rejects unbounded history windows and unknown workstations", async () => {
		const h = harness();
		const { id } = await h.enroll();
		for (const query of ["from=0&to=9999999999", "limit=101", "offset=-1", "from=x"]) {
			expect((await h.request(`/api/workstations/${id}/metrics?${query}`)).status).toBe(400);
			expect((await h.request(`/api/workstations/${id}/connectivity?${query}`)).status).toBe(400);
		}
		expect((await h.request(`/api/workstations/${uuid(99)}/metrics`)).status).toBe(404);
		expect((await h.request(`/api/workstations/${uuid(99)}/connectivity`)).status).toBe(404);
	});

	test("the revoke endpoint invalidates only the presented credential", async () => {
		const h = harness();
		const first = await h.enroll();
		expect(
			(
				await h.request("/api/workstation-probe/revoke", {
					method: "POST",
					headers: auth(first.token),
				})
			).status,
		).toBe(204);
		expect(
			(await h.request("/api/workstation-probe/targets", { headers: auth(first.token) })).status,
		).toBe(401);
		// The workstation, its history and its installation binding survive, so a
		// re-login rotates a new key for the same workstation ID.
		expect((await h.request(`/api/workstations/${first.id}`)).status).toBe(200);
		const relogin = await h.enroll();
		expect(relogin.id).toBe(first.id);
		expect(
			(await h.request("/api/workstation-probe/targets", { headers: auth(relogin.token) })).status,
		).toBe(200);
		expect(
			(await h.request("/api/workstation-probe/targets", { headers: auth(first.token) })).status,
		).toBe(401);
	});

	test("the revoke handler refuses an unauthenticated context, rate limits and failed updates", async () => {
		const h = harness({ WORKSTATION_RATE_LIMIT: "2" });
		const { token } = await h.enroll();
		const repos = createD1Repositories(h.db);
		const row = await repos.workstations.findByTokenHash(await hashSecret(token));
		if (!row) throw new Error("missing workstation row");
		const tokenHash = await hashSecret(token);
		const isolated = new Hono<AppEnv>();
		isolated.use("*", async (c, next) => {
			c.env = h.env;
			c.set("repos", repos);
			if (c.req.header("Test-Workstation") === "yes") {
				c.set("workstation", row);
				c.set("workstationTokenHash", c.req.header("Test-Hash") ?? tokenHash);
			}
			await next();
		});
		isolated.post("/api/workstation-probe/revoke", workstationRevokeRoute);
		const call = (headers: Record<string, string> = {}) =>
			isolated.request(`${ORIGIN}/api/workstation-probe/revoke`, { method: "POST", headers });

		expect((await call()).status).toBe(401);
		expect((await call({ "Test-Workstation": "yes", "Test-Hash": "hash:stale" })).status).toBe(409);
		expect((await call({ "Test-Workstation": "yes" })).status).toBe(204);
		expect((await call({ "Test-Workstation": "yes" })).status).toBe(429);
	});

	test("the revoke path accepts no other credential type or method", async () => {
		const h = harness();
		const { token } = await h.enroll();
		for (const headers of [
			{},
			{ Authorization: "Bearer write-key" },
			{ Authorization: "Bearer read-key" },
		]) {
			expect(
				(await h.request("/api/workstation-probe/revoke", { method: "POST", headers })).status,
			).toBe(401);
		}
		expect(
			(await h.request("/api/workstation-probe/revoke", { headers: auth(token) })).status,
		).toBe(404);
	});

	test("revocation requires same-origin Access and owner or manager authority", async () => {
		const noAccess = harness({}, false);
		const denied = await noAccess.enroll();
		expect(
			(await noAccess.request(`/api/workstations/${denied.id}`, { method: "DELETE" })).status,
		).toBe(403);

		const h = harness();
		const { id, token } = await h.enroll();
		expect((await h.request(`/api/workstations/${id}`, { method: "DELETE" })).status).toBe(200);
		expect(
			(await h.request("/api/workstation-probe/targets", { headers: auth(token) })).status,
		).toBe(401);
		expect((await h.request(`/api/workstations/${uuid(99)}`, { method: "DELETE" })).status).toBe(
			404,
		);

		const foreign = await h.enroll({ owner: OWNER });
		const notOwner = await h.request(`/api/workstations/${foreign.id}`, {
			method: "DELETE",
			headers: { "Test-Principal": OTHER_OWNER },
		});
		expect(notOwner.status).toBe(403);
		const manager = await h.request(`/api/workstations/${foreign.id}`, {
			method: "DELETE",
			headers: { "Test-Principal": OWNER },
		});
		expect(manager.status).toBe(200);
	});

	test("revocation requires a resolved Access principal", async () => {
		const h = harness();
		const { id } = await h.enroll();
		const repos = createD1Repositories(h.db);
		const isolated = new Hono<AppEnv>();
		isolated.use("*", async (c, next) => {
			c.env = h.env;
			c.set("repos", repos);
			c.set("accessAuthenticated", true);
			await next();
		});
		isolated.delete("/api/workstations/:id", workstationDeleteRoute);
		const response = await isolated.request(`${ORIGIN}/api/workstations/${id}`, {
			method: "DELETE",
			headers: { Origin: ORIGIN, "X-Bat-Management": "1" },
		});
		expect(response.status).toBe(403);
	});

	test("revocation without the CSRF confirmation is rejected", async () => {
		const h = harness();
		const { id } = await h.enroll();
		const response = await h.app.request(`${ORIGIN}/api/workstations/${id}`, {
			method: "DELETE",
			headers: { Origin: "https://evil.example", "X-Bat-Management": "1" },
		});
		expect(response.status).toBe(403);
	});
});

describe("authorization codes are bound to the credential lifecycle", () => {
	async function pendingCode(h: Harness, code: string, installation = INSTALLATION) {
		await h.db
			.prepare(
				"INSERT INTO workstation_codes(code_hash, owner, installation_id, challenge, name, created_at, expires_at, consumed_at) VALUES (?,?,?,?,?,?,?,NULL)",
			)
			.bind(
				await hashSecret(code),
				OWNER,
				installation,
				await pkceChallenge(VERIFIER),
				"Li MacBook",
				nowSeconds(),
				nowSeconds() + 300,
			)
			.run();
	}

	test("revoking expires a pending code, while a fresh authorize still logs in", async () => {
		const h = harness();
		const first = await h.enroll();
		const exchange = (code: string) =>
			h.request("/api/workstation-auth/exchange", {
				method: "POST",
				body: { code, code_verifier: VERIFIER, installation_id: INSTALLATION },
			});
		await pendingCode(h, "pending-before-revoke");
		expect(
			(
				await h.request("/api/workstation-probe/revoke", {
					method: "POST",
					headers: auth(first.token),
				})
			).status,
		).toBe(204);
		expect((await exchange("pending-before-revoke")).status).toBe(401);
		await pendingCode(h, "fresh-after-revoke");
		const relogin = await exchange("fresh-after-revoke");
		expect(relogin.status).toBe(200);
		const issued = (await relogin.json()) as { workstation_id: string };
		expect(issued.workstation_id).toBe(first.id);
	});

	test("deleting expires a pending code, while a fresh authorize creates a new workstation", async () => {
		const h = harness();
		const first = await h.enroll();
		const exchange = (code: string) =>
			h.request("/api/workstation-auth/exchange", {
				method: "POST",
				body: { code, code_verifier: VERIFIER, installation_id: INSTALLATION },
			});
		await pendingCode(h, "pending-before-delete");
		expect((await h.request(`/api/workstations/${first.id}`, { method: "DELETE" })).status).toBe(
			200,
		);
		expect((await exchange("pending-before-delete")).status).toBe(401);
		await pendingCode(h, "fresh-after-delete");
		const recreated = await exchange("fresh-after-delete");
		expect(recreated.status).toBe(200);
		const issued = (await recreated.json()) as { workstation_id: string };
		expect(issued.workstation_id).not.toBe(first.id);
	});
});

describe("workstation observation responses never cache", () => {
	test("auth, probe, browser and monitoring responses all carry no-store", async () => {
		const h = harness();
		const { id, token } = await h.enroll();
		const env = { ...h.env, BAT_WRITE_KEY: "write-key", BAT_READ_KEY: "read-key" };
		const code = "no-store-code";
		await h.db
			.prepare(
				"INSERT INTO workstation_codes(code_hash, owner, installation_id, challenge, name, created_at, expires_at, consumed_at) VALUES (?,?,?,?,?,?,?,NULL)",
			)
			.bind(
				await hashSecret(code),
				OWNER,
				uuid(5),
				await pkceChallenge(VERIFIER),
				"Cache test",
				nowSeconds(),
				nowSeconds() + 300,
			)
			.run();
		const json = { "Content-Type": "application/json" };
		const cases: Array<[string, RequestInit, number]> = [
			["/api/workstation-auth/authorize", { method: "POST", headers: json, body: "{}" }, 403],
			[
				"/api/workstation-auth/exchange",
				{
					method: "POST",
					headers: json,
					body: JSON.stringify({
						code,
						code_verifier: VERIFIER,
						installation_id: uuid(5),
					}),
				},
				200,
			],
			["/api/workstation-auth/exchange", { method: "POST", headers: json, body: "{}" }, 400],
			["/api/workstation-probe/targets", { headers: auth(token) }, 200],
			["/api/workstation-probe/targets", {}, 401],
			[
				"/api/workstation-probe/reports",
				{
					method: "POST",
					headers: { ...auth(token), ...json },
					body: JSON.stringify(h.report(uuid(1))),
				},
				200,
			],
			["/api/workstation-probe/reports", { method: "POST", headers: json, body: "{}" }, 401],
			["/api/workstations", { headers: { Authorization: "Bearer read-key" } }, 200],
			[`/api/workstations/${uuid(99)}`, { headers: { Authorization: "Bearer read-key" } }, 404],
			[`/api/workstations/${id}`, { method: "DELETE" }, 401],
			["/api/monitoring/workstations", { headers: { Authorization: "Bearer read-key" } }, 200],
			["/api/monitoring/workstations", { headers: { Authorization: "Bearer write-key" } }, 403],
			["/api/monitoring/workstations", {}, 401],
		];
		for (const [path, init, status] of cases) {
			const response = await publicApp.request(`${ORIGIN}${path}`, init, env);
			expect(response.status, path).toBe(status);
			expect(response.headers.get("Cache-Control"), path).toContain("no-store");
			expect(response.headers.get("X-Content-Type-Options"), path).toBe("nosniff");
		}
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});
