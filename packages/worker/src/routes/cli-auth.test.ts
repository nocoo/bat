// Tests for CLI auth routes and token scope enforcement
import { Hono } from "hono";
import { beforeEach, describe, expect, test } from "vitest";
import { apiKeyAuth, isCliAssetsScopePath } from "../middleware/api-key.js";
import { findCliTokenByHash, hashToken } from "../services/cli-tokens.js";
import { createMockD1 } from "../test-helpers/mock-d1.js";
import type { AppEnv } from "../types.js";
import { cliAuthRoute } from "./cli-auth.js";
import { cliTokensDeleteRoute, cliTokensListRoute } from "./cli-tokens.js";

// --- Helpers ---

function makeCtx(
	db: D1Database,
	opts: {
		params?: Record<string, string>;
		body?: unknown;
		rawBody?: string;
		accessAuthenticated?: boolean;
		authorization?: string;
	} = {},
) {
	const variables: Record<string, unknown> = {};
	if (opts.accessAuthenticated) {
		variables.accessAuthenticated = true;
	}
	// Determine raw text: explicit rawBody takes priority, then JSON-stringify body, then empty
	const rawText =
		opts.rawBody !== undefined
			? opts.rawBody
			: opts.body !== undefined
				? JSON.stringify(opts.body)
				: "";
	return {
		env: { DB: db, BAT_WRITE_KEY: "write-key", BAT_READ_KEY: "read-key" },
		req: {
			param: (key: string) => opts.params?.[key] ?? "",
			text: async () => rawText,
			json: async () => {
				if (opts.body === undefined) {
					throw new Error("No body");
				}
				return opts.body;
			},
			header: (name: string) => {
				if (name === "Authorization") {
					return opts.authorization;
				}
				return undefined;
			},
			method: "POST",
		},
		get: (key: string) => variables[key],
		set: (key: string, val: unknown) => {
			variables[key] = val;
		},
		json: (data: unknown, status?: number) =>
			new Response(JSON.stringify(data), {
				status: status ?? 200,
				headers: { "Content-Type": "application/json" },
			}),
		body: (_data: unknown, status?: number) => new Response(null, { status: status ?? 200 }),
		// biome-ignore lint/suspicious/noExplicitAny: test helper
	} as any;
}

// --- /api/auth/cli tests ---

describe("/api/auth/cli", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	test("mints token when CF Access authenticated", async () => {
		const ctx = makeCtx(db, {
			accessAuthenticated: true,
			body: { label: "my-cli" },
		});
		const res = await cliAuthRoute(ctx);
		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.token).toBeDefined();
		expect(data.token.length).toBe(64); // 32 bytes hex
		expect(data.label).toBe("my-cli");
		expect(data.scope).toBe("assets");
		expect(data.id).toBeTypeOf("number");
	});

	test("mints token with defaults when no body", async () => {
		const ctx = makeCtx(db, { accessAuthenticated: true });
		const res = await cliAuthRoute(ctx);
		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.label).toBe("cli");
		expect(data.scope).toBe("assets");
	});

	test("rejects when NOT CF Access authenticated (no auth)", async () => {
		const ctx = makeCtx(db, { accessAuthenticated: false, body: {} });
		const res = await cliAuthRoute(ctx);
		expect(res.status).toBe(403);
		const data = await res.json();
		expect(data.error).toContain("browser authentication");
	});

	test("rejects when called with static write key (not Access JWT)", async () => {
		// Simulates: someone calling /api/auth/cli with Bearer BAT_WRITE_KEY
		// accessAuthenticated would be false because Access JWT is not verified
		const ctx = makeCtx(db, {
			accessAuthenticated: false,
			authorization: "Bearer write-key",
			body: {},
		});
		const res = await cliAuthRoute(ctx);
		expect(res.status).toBe(403);
	});

	test("rejects when called with existing CLI bearer token (not Access JWT)", async () => {
		const ctx = makeCtx(db, {
			accessAuthenticated: false,
			authorization: "Bearer some-cli-token",
			body: {},
		});
		const res = await cliAuthRoute(ctx);
		expect(res.status).toBe(403);
	});

	test("rejects overly long label", async () => {
		const ctx = makeCtx(db, {
			accessAuthenticated: true,
			body: { label: "x".repeat(100) },
		});
		const res = await cliAuthRoute(ctx);
		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.error).toContain("label");
	});

	test("rejects malformed JSON body", async () => {
		const ctx = makeCtx(db, {
			accessAuthenticated: true,
			rawBody: "{invalid json!!!",
		});
		const res = await cliAuthRoute(ctx);
		expect(res.status).toBe(400);
		const data = await res.json();
		expect(data.error).toContain("Invalid JSON");
	});

	test("rejects malformed JSON without Content-Length header", async () => {
		// Simulates chunked request with no Content-Length but non-empty malformed body
		const ctx = makeCtx(db, {
			accessAuthenticated: true,
			rawBody: "not-json-at-all",
		});
		const res = await cliAuthRoute(ctx);
		expect(res.status).toBe(400);
	});

	test("accepts valid JSON without Content-Length header", async () => {
		// Simulates chunked request with valid JSON body
		const ctx = makeCtx(db, {
			accessAuthenticated: true,
			body: { label: "chunked-cli" },
		});
		const res = await cliAuthRoute(ctx);
		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.label).toBe("chunked-cli");
	});

	test("stores hashed token (not plaintext)", async () => {
		const ctx = makeCtx(db, { accessAuthenticated: true, body: {} });
		const res = await cliAuthRoute(ctx);
		const data = await res.json();
		const plaintext = data.token;

		// Verify: token_hash in DB matches SHA-256 of returned plaintext
		const expectedHash = await hashToken(plaintext);
		const row = await db
			.prepare("SELECT token_hash FROM cli_tokens WHERE id = ?")
			.bind(data.id)
			.first<{ token_hash: string }>();
		expect(row?.token_hash).toBe(expectedHash);
	});

	test("always mints with scope=assets", async () => {
		const ctx = makeCtx(db, {
			accessAuthenticated: true,
			body: { label: "test" },
		});
		const res = await cliAuthRoute(ctx);
		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.scope).toBe("assets");
	});
});

// --- /api/cli-tokens tests ---

describe("/api/cli-tokens", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	test("list returns empty array initially", async () => {
		const ctx = makeCtx(db);
		const res = await cliTokensListRoute(ctx);
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data).toEqual([]);
	});

	test("list returns created tokens (without plaintext)", async () => {
		// Create a token first
		const hash = await hashToken("test-token-123");
		await db
			.prepare("INSERT INTO cli_tokens (token_hash, label, scope) VALUES (?, ?, ?)")
			.bind(hash, "test-label", "assets")
			.run();

		const ctx = makeCtx(db);
		const res = await cliTokensListRoute(ctx);
		const data = await res.json();
		expect(data).toHaveLength(1);
		expect(data[0].label).toBe("test-label");
		expect(data[0].scope).toBe("assets");
		// Must NOT contain token_hash or plaintext
		expect(data[0].token_hash).toBeUndefined();
		expect(data[0].token).toBeUndefined();
	});

	test("delete removes token", async () => {
		const hash = await hashToken("test-token-456");
		await db
			.prepare("INSERT INTO cli_tokens (token_hash, label, scope) VALUES (?, ?, ?)")
			.bind(hash, "to-delete", "assets")
			.run();

		const ctx = makeCtx(db, { params: { id: "1" } });
		const res = await cliTokensDeleteRoute(ctx);
		expect(res.status).toBe(204);

		// Verify it's gone
		const row = await db.prepare("SELECT * FROM cli_tokens WHERE id = 1").first();
		expect(row).toBeNull();
	});

	test("delete returns 404 for non-existent token", async () => {
		const ctx = makeCtx(db, { params: { id: "999" } });
		const res = await cliTokensDeleteRoute(ctx);
		expect(res.status).toBe(404);
	});

	test("delete returns 400 for invalid id", async () => {
		const ctx = makeCtx(db, { params: { id: "abc" } });
		const res = await cliTokensDeleteRoute(ctx);
		expect(res.status).toBe(400);
	});
});

// --- Scope path enforcement ---

describe("isCliAssetsScopePath", () => {
	test("allows /api/agents", () => {
		expect(isCliAssetsScopePath("/api/agents")).toBe(true);
	});

	test("allows /api/agents/:id", () => {
		expect(isCliAssetsScopePath("/api/agents/agt_abc123")).toBe(true);
	});

	test("allows /api/agents/heartbeat", () => {
		expect(isCliAssetsScopePath("/api/agents/heartbeat")).toBe(true);
	});

	test("allows /api/assets", () => {
		expect(isCliAssetsScopePath("/api/assets")).toBe(true);
	});

	test("allows /api/assets/overview", () => {
		expect(isCliAssetsScopePath("/api/assets/overview")).toBe(true);
	});

	test("allows /api/assets/map", () => {
		expect(isCliAssetsScopePath("/api/assets/map")).toBe(true);
	});

	test("allows /api/bindings", () => {
		expect(isCliAssetsScopePath("/api/bindings")).toBe(true);
	});

	test("allows /api/bindings/:agent_id/:asset_id", () => {
		expect(isCliAssetsScopePath("/api/bindings/agt_x/ast_y")).toBe(true);
	});

	// Routes that assets-scope tokens must NOT access
	test("rejects /api/ingest", () => {
		expect(isCliAssetsScopePath("/api/ingest")).toBe(false);
	});

	test("rejects /api/identity", () => {
		expect(isCliAssetsScopePath("/api/identity")).toBe(false);
	});

	test("rejects /api/tier2", () => {
		expect(isCliAssetsScopePath("/api/tier2")).toBe(false);
	});

	test("rejects /api/hosts", () => {
		expect(isCliAssetsScopePath("/api/hosts")).toBe(false);
	});

	test("rejects /api/settings", () => {
		expect(isCliAssetsScopePath("/api/settings")).toBe(false);
	});

	test("rejects /api/webhooks", () => {
		expect(isCliAssetsScopePath("/api/webhooks")).toBe(false);
	});

	test("rejects /api/tags", () => {
		expect(isCliAssetsScopePath("/api/tags")).toBe(false);
	});

	test("rejects /api/alerts", () => {
		expect(isCliAssetsScopePath("/api/alerts")).toBe(false);
	});

	test("rejects /api/monitoring/hosts", () => {
		expect(isCliAssetsScopePath("/api/monitoring/hosts")).toBe(false);
	});

	test("rejects /api/events", () => {
		expect(isCliAssetsScopePath("/api/events")).toBe(false);
	});

	test("rejects /api/cli-tokens", () => {
		expect(isCliAssetsScopePath("/api/cli-tokens")).toBe(false);
	});

	test("rejects /api/auth/cli", () => {
		expect(isCliAssetsScopePath("/api/auth/cli")).toBe(false);
	});
});

// --- findCliTokenByHash service tests ---

describe("findCliTokenByHash", () => {
	let db: D1Database;

	beforeEach(() => {
		db = createMockD1();
	});

	test("returns null for non-existent token hash", async () => {
		const result = await findCliTokenByHash(db, "nonexistent-hash");
		expect(result).toBeNull();
	});

	test("returns token row when hash matches", async () => {
		const hash = await hashToken("my-secret-token");
		await db
			.prepare("INSERT INTO cli_tokens (token_hash, label, scope) VALUES (?, ?, ?)")
			.bind(hash, "test-cli", "assets")
			.run();

		const result = await findCliTokenByHash(db, hash);
		expect(result).not.toBeNull();
		expect(result?.label).toBe("test-cli");
		expect(result?.scope).toBe("assets");
		expect(result?.id).toBeTypeOf("number");
	});

	test("updates last_used_at on lookup", async () => {
		const hash = await hashToken("usage-tracking-token");
		await db
			.prepare("INSERT INTO cli_tokens (token_hash, label, scope) VALUES (?, ?, ?)")
			.bind(hash, "track-me", "assets")
			.run();

		// First call — last_used_at should be updated
		await findCliTokenByHash(db, hash);

		const row = await db
			.prepare("SELECT last_used_at FROM cli_tokens WHERE token_hash = ?")
			.bind(hash)
			.first<{ last_used_at: number | null }>();
		expect(row?.last_used_at).toBeTypeOf("number");
	});
});

// --- Middleware integration: CLI token auth path ---

describe("apiKeyAuth middleware — CLI token path", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(async () => {
		db = createMockD1();
		app = new Hono<AppEnv>();

		// Inject test env bindings with real mock D1
		app.use("*", async (c, next) => {
			c.env = {
				DB: db,
				BAT_WRITE_KEY: "write-key",
				BAT_READ_KEY: "read-key",
			};
			return next();
		});

		app.use("/api/*", apiKeyAuth);

		// Asset-scope routes (GET + mutation)
		app.get("/api/agents", (c) => c.json({ ok: true }));
		app.post("/api/agents", (c) => c.json({ ok: true }, 201));
		app.get("/api/assets", (c) => c.json({ ok: true }));
		app.post("/api/assets", (c) => c.json({ ok: true }, 201));
		app.delete("/api/assets/:id", (c) => c.json({ ok: true }));
		app.get("/api/bindings", (c) => c.json({ ok: true }));
		app.delete("/api/bindings/:id", (c) => c.json({ ok: true }));

		// Non-asset routes
		app.get("/api/hosts", (c) => c.json({ ok: true }));
		app.get("/api/settings", (c) => c.json({ ok: true }));
	});

	async function insertToken(): Promise<string> {
		const plaintext = `cli-test-token-${Math.random().toString(36).slice(2)}`;
		const hash = await hashToken(plaintext);
		await db
			.prepare("INSERT INTO cli_tokens (token_hash, label, scope) VALUES (?, ?, ?)")
			.bind(hash, "test", "assets")
			.run();
		return plaintext;
	}

	function makeReq(method: string, path: string, token?: string): Request {
		const headers: Record<string, string> = {};
		if (token) {
			headers.Authorization = `Bearer ${token}`;
		}
		return new Request(`https://bat.example.com${path}`, { method, headers });
	}

	test("assets-scope token can GET /api/agents", async () => {
		const token = await insertToken();
		const res = await app.request(makeReq("GET", "/api/agents", token));
		expect(res.status).toBe(200);
	});

	test("assets-scope token can GET /api/assets", async () => {
		const token = await insertToken();
		const res = await app.request(makeReq("GET", "/api/assets", token));
		expect(res.status).toBe(200);
	});

	test("assets-scope token can GET /api/bindings", async () => {
		const token = await insertToken();
		const res = await app.request(makeReq("GET", "/api/bindings", token));
		expect(res.status).toBe(200);
	});

	test("assets-scope token can POST /api/agents (write on asset route)", async () => {
		const token = await insertToken();
		const res = await app.request(makeReq("POST", "/api/agents", token));
		expect(res.status).toBe(201);
	});

	test("assets-scope token can DELETE /api/assets/:id", async () => {
		const token = await insertToken();
		const res = await app.request(makeReq("DELETE", "/api/assets/ast_123", token));
		expect(res.status).toBe(200);
	});

	test("assets-scope token CANNOT access /api/hosts", async () => {
		const token = await insertToken();
		const res = await app.request(makeReq("GET", "/api/hosts", token));
		expect(res.status).toBe(403);
	});

	test("read key CANNOT POST /api/agents (write on asset route)", async () => {
		const res = await app.request(makeReq("POST", "/api/agents", "read-key"));
		expect(res.status).toBe(403);
	});

	test("read key CANNOT DELETE /api/assets/:id", async () => {
		const res = await app.request(makeReq("DELETE", "/api/assets/ast_123", "read-key"));
		expect(res.status).toBe(403);
	});

	test("read key CANNOT DELETE /api/bindings/:id", async () => {
		const res = await app.request(makeReq("DELETE", "/api/bindings/bnd_123", "read-key"));
		expect(res.status).toBe(403);
	});

	test("write key can POST /api/agents", async () => {
		const res = await app.request(makeReq("POST", "/api/agents", "write-key"));
		expect(res.status).toBe(201);
	});

	test("invalid CLI token returns 403", async () => {
		const res = await app.request(makeReq("GET", "/api/agents", "bogus-token"));
		expect(res.status).toBe(403);
	});

	test("no token returns 401", async () => {
		const res = await app.request(makeReq("GET", "/api/agents"));
		expect(res.status).toBe(401);
	});
});
