import type { CliTokenRow } from "@bat/shared";
import { Hono } from "hono";
import { describe, expect, test, vi } from "vitest";
import { rememberToken, tokenCacheKey, tokenRevokedKey } from "../lib/cli-token-cache";
import type { AppEnv } from "../types";
import { apiKeyAuth } from "./api-key";

const WRITE_KEY = "test-write-key-123";
const READ_KEY = "test-read-key-456";

function createApp() {
	const app = new Hono<AppEnv>();

	// Inject test env bindings
	app.use("*", async (c, next) => {
		c.env = {
			DB: {} as D1Database,
			BAT_WRITE_KEY: WRITE_KEY,
			BAT_READ_KEY: READ_KEY,
		};
		return next();
	});

	// Simulate accessAuth middleware setting the context flag
	// when Cf-Access-Jwt-Assertion header is present
	app.use("/api/*", async (c, next) => {
		if (c.req.header("Cf-Access-Jwt-Assertion")) {
			c.set("accessAuthenticated", true);
		}
		return next();
	});

	// Apply middleware to all /api/* routes
	app.use("/api/*", apiKeyAuth);

	// Write routes
	app.post("/api/ingest", (c) => c.body(null, 204));
	app.post("/api/identity", (c) => c.body(null, 204));

	// Read routes
	app.get("/api/hosts", (c) => c.json([]));
	app.get("/api/hosts/:id/metrics", (c) => c.json([]));
	app.get("/api/alerts", (c) => c.json([]));

	// Machine read routes
	app.get("/api/monitoring/hosts", (c) => c.json([]));

	// Public route
	app.get("/api/live", (c) => c.json({ status: "healthy" }));

	return app;
}

function req(
	method: string,
	path: string,
	options?: { key?: string; host?: string; accessJwt?: string },
): Request {
	const headers: Record<string, string> = {};
	if (options?.key) {
		headers.Authorization = `Bearer ${options.key}`;
	}
	if (options?.host) {
		headers.host = options.host;
	}
	if (options?.accessJwt) {
		headers["Cf-Access-Jwt-Assertion"] = options.accessJwt;
	}
	return new Request(`http://localhost${path}`, { method, headers });
}

describe("apiKeyAuth middleware", () => {
	const app = createApp();

	describe("public routes", () => {
		test("GET /api/live requires no auth", async () => {
			const res = await app.request(req("GET", "/api/live"));
			expect(res.status).toBe(200);
		});
	});

	describe("write routes", () => {
		test("POST /api/ingest accepts write key", async () => {
			const res = await app.request(req("POST", "/api/ingest", { key: WRITE_KEY }));
			expect(res.status).toBe(204);
		});

		test("POST /api/identity accepts write key", async () => {
			const res = await app.request(req("POST", "/api/identity", { key: WRITE_KEY }));
			expect(res.status).toBe(204);
		});

		test("POST /api/ingest rejects read key with 403", async () => {
			const res = await app.request(req("POST", "/api/ingest", { key: READ_KEY }));
			expect(res.status).toBe(403);
			const body = (await res.json()) as { error: string };
			expect(body.error).toContain("Read key");
		});

		test("POST /api/ingest rejects missing auth with 401", async () => {
			const res = await app.request(req("POST", "/api/ingest"));
			expect(res.status).toBe(401);
		});

		test("POST /api/ingest rejects invalid key with 403", async () => {
			const res = await app.request(req("POST", "/api/ingest", { key: "invalid-key" }));
			expect(res.status).toBe(403);
			const body = (await res.json()) as { error: string };
			expect(body.error).toContain("Invalid");
		});
	});

	describe("read routes (localhost)", () => {
		test("GET /api/hosts accepts read key", async () => {
			const res = await app.request(req("GET", "/api/hosts", { key: READ_KEY }));
			expect(res.status).toBe(200);
		});

		test("GET /api/alerts accepts read key", async () => {
			const res = await app.request(req("GET", "/api/alerts", { key: READ_KEY }));
			expect(res.status).toBe(200);
		});

		test("GET /api/hosts rejects write key with 403", async () => {
			const res = await app.request(req("GET", "/api/hosts", { key: WRITE_KEY }));
			expect(res.status).toBe(403);
			const body = (await res.json()) as { error: string };
			expect(body.error).toContain("Write key");
		});

		test("GET /api/hosts rejects missing auth with 401", async () => {
			const res = await app.request(req("GET", "/api/hosts"));
			expect(res.status).toBe(401);
		});

		test("GET /api/hosts rejects invalid key with 403", async () => {
			const res = await app.request(req("GET", "/api/hosts", { key: "bad-key" }));
			expect(res.status).toBe(403);
		});
	});

	describe("write-route detection across all mutation paths", () => {
		function appWithRoutes() {
			const a = new Hono<AppEnv>();
			a.use("*", async (c, next) => {
				c.env = { DB: {} as D1Database, BAT_WRITE_KEY: WRITE_KEY, BAT_READ_KEY: READ_KEY };
				return next();
			});
			a.use("/api/*", apiKeyAuth);
			// Catch-all handler so 204 means middleware passed
			a.all("*", (c) => c.body(null, 204));
			return a;
		}

		test("malformed Authorization (no Bearer prefix) → 401", async () => {
			const a = appWithRoutes();
			const res = await a.request(
				new Request("http://localhost/api/hosts", {
					headers: { Authorization: "Basic xyz" },
				}),
			);
			expect(res.status).toBe(401);
		});

		test("Authorization with only 'Bearer' (no token) → 401", async () => {
			const a = appWithRoutes();
			const res = await a.request(
				new Request("http://localhost/api/hosts", {
					headers: { Authorization: "Bearer" },
				}),
			);
			expect(res.status).toBe(401);
		});

		test("POST /api/tier2 is a write route", async () => {
			const a = appWithRoutes();
			const ok = await a.request(req("POST", "/api/tier2", { key: WRITE_KEY }));
			expect(ok.status).toBe(204);
			const bad = await a.request(req("POST", "/api/tier2", { key: READ_KEY }));
			expect(bad.status).toBe(403);
		});

		test("POST /api/events uses its own auth (bypasses middleware)", async () => {
			const a = appWithRoutes();
			const res = await a.request(req("POST", "/api/events"));
			expect(res.status).toBe(204);
		});

		test("POST /api/webhooks requires write key", async () => {
			const a = appWithRoutes();
			expect((await a.request(req("POST", "/api/webhooks", { key: WRITE_KEY }))).status).toBe(204);
			expect((await a.request(req("POST", "/api/webhooks", { key: READ_KEY }))).status).toBe(403);
			// GET is read-only → read key OK
			expect((await a.request(req("GET", "/api/webhooks", { key: READ_KEY }))).status).toBe(204);
		});

		test("DELETE/POST /api/webhooks/:id requires write key", async () => {
			const a = appWithRoutes();
			expect((await a.request(req("DELETE", "/api/webhooks/abc", { key: WRITE_KEY }))).status).toBe(
				204,
			);
			expect(
				(await a.request(req("POST", "/api/webhooks/abc/regenerate", { key: WRITE_KEY }))).status,
			).toBe(204);
			expect((await a.request(req("DELETE", "/api/webhooks/abc", { key: READ_KEY }))).status).toBe(
				403,
			);
		});

		test("PUT/DELETE /api/hosts/:id/maintenance requires write key", async () => {
			const a = appWithRoutes();
			expect(
				(await a.request(req("PUT", "/api/hosts/my-host/maintenance", { key: WRITE_KEY }))).status,
			).toBe(204);
			expect(
				(await a.request(req("DELETE", "/api/hosts/my-host/maintenance", { key: WRITE_KEY })))
					.status,
			).toBe(204);
			expect(
				(await a.request(req("PUT", "/api/hosts/my-host/maintenance", { key: READ_KEY }))).status,
			).toBe(403);
			// GET is read-only
			expect(
				(await a.request(req("GET", "/api/hosts/my-host/maintenance", { key: READ_KEY }))).status,
			).toBe(204);
		});

		test("POST /api/tags requires write key", async () => {
			const a = appWithRoutes();
			expect((await a.request(req("POST", "/api/tags", { key: WRITE_KEY }))).status).toBe(204);
			expect((await a.request(req("POST", "/api/tags", { key: READ_KEY }))).status).toBe(403);
		});

		test("PUT/DELETE /api/tags/:id requires write key", async () => {
			const a = appWithRoutes();
			expect((await a.request(req("PUT", "/api/tags/t1", { key: WRITE_KEY }))).status).toBe(204);
			expect((await a.request(req("DELETE", "/api/tags/t1", { key: WRITE_KEY }))).status).toBe(204);
			expect((await a.request(req("PUT", "/api/tags/t1", { key: READ_KEY }))).status).toBe(403);
		});

		test("POST/PUT/DELETE /api/hosts/:id/tags requires write key", async () => {
			const a = appWithRoutes();
			expect((await a.request(req("POST", "/api/hosts/h1/tags", { key: WRITE_KEY }))).status).toBe(
				204,
			);
			expect((await a.request(req("PUT", "/api/hosts/h1/tags", { key: WRITE_KEY }))).status).toBe(
				204,
			);
			expect(
				(await a.request(req("DELETE", "/api/hosts/h1/tags/t1", { key: WRITE_KEY }))).status,
			).toBe(204);
			expect((await a.request(req("POST", "/api/hosts/h1/tags", { key: READ_KEY }))).status).toBe(
				403,
			);
		});

		test("POST/DELETE /api/hosts/:id/allowed-ports requires write key", async () => {
			const a = appWithRoutes();
			expect(
				(await a.request(req("POST", "/api/hosts/h1/allowed-ports", { key: WRITE_KEY }))).status,
			).toBe(204);
			expect(
				(await a.request(req("DELETE", "/api/hosts/h1/allowed-ports/22", { key: WRITE_KEY })))
					.status,
			).toBe(204);
			expect(
				(await a.request(req("POST", "/api/hosts/h1/allowed-ports", { key: READ_KEY }))).status,
			).toBe(403);
		});

		test("unknown read path with write key → 403", async () => {
			const a = appWithRoutes();
			expect((await a.request(req("GET", "/api/some-read-path", { key: WRITE_KEY }))).status).toBe(
				403,
			);
		});
	});

	describe("browser endpoint with Access JWT", () => {
		test("GET /api/hosts accepts verified Access JWT without API key", async () => {
			const res = await app.request(
				req("GET", "/api/hosts", {
					host: "bat.hexly.ai",
					accessJwt: "valid-jwt-token", // triggers accessAuthenticated context flag
				}),
			);
			// Should pass through without 401/403 because context flag is set
			expect(res.status).toBe(200);
		});

		test("GET /api/alerts accepts verified Access JWT without API key", async () => {
			const res = await app.request(
				req("GET", "/api/alerts", {
					host: "bat.hexly.ai",
					accessJwt: "valid-jwt-token",
				}),
			);
			expect(res.status).toBe(200);
		});

		test("GET /api/hosts rejects forged header without context flag", async () => {
			// Create app without the mock accessAuth middleware
			const appNoAccessAuth = new Hono<AppEnv>();
			appNoAccessAuth.use("*", async (c, next) => {
				c.env = {
					DB: {} as D1Database,
					BAT_WRITE_KEY: WRITE_KEY,
					BAT_READ_KEY: READ_KEY,
				};
				return next();
			});
			// No middleware to set accessAuthenticated
			appNoAccessAuth.use("/api/*", apiKeyAuth);
			appNoAccessAuth.get("/api/hosts", (c) => c.json([]));

			const res = await appNoAccessAuth.request(
				req("GET", "/api/hosts", {
					host: "bat.hexly.ai",
					accessJwt: "forged-jwt-token", // header present but no context flag
				}),
			);
			// Should require API key since context flag is not set
			expect(res.status).toBe(401);
		});

		test("GET /api/monitoring/hosts still requires API key even with Access JWT", async () => {
			const res = await app.request(
				req("GET", "/api/monitoring/hosts", {
					host: "bat.hexly.ai",
					accessJwt: "valid-jwt-token",
				}),
			);
			// Machine routes require API key even on browser endpoint
			expect(res.status).toBe(401);
		});

		test("GET /api/monitoring/hosts accepts read key on browser endpoint", async () => {
			const res = await app.request(
				req("GET", "/api/monitoring/hosts", {
					host: "bat.hexly.ai",
					accessJwt: "valid-jwt-token",
					key: READ_KEY,
				}),
			);
			expect(res.status).toBe(200);
		});
	});
});

// CLI token + KV cache integration tests for Task #14 (T1).
//
// Covers:
//   - cache miss → D1 lookup → cache populate
//   - cache hit  → 0 D1 calls
//   - revoked sentinel → 403 even if cache or D1 still has the row
//   - KV throw on read → fallback to D1 (auth still works)
//   - no BAT_KV binding → behaviour identical to before this task

interface PutEntry {
	value: string;
	expirationTtl?: number;
}

function makeKv() {
	const store = new Map<string, PutEntry>();
	const calls = { gets: 0, puts: 0, deletes: 0 };
	return {
		store,
		calls,
		kv: {
			get: vi.fn(async (key: string, type?: "json" | "text") => {
				calls.gets++;
				const entry = store.get(key);
				if (!entry) {
					return null;
				}
				if (type === "json") {
					return JSON.parse(entry.value);
				}
				return entry.value;
			}),
			put: vi.fn(async (key: string, value: string, opts?: { expirationTtl?: number }) => {
				calls.puts++;
				store.set(key, { value, expirationTtl: opts?.expirationTtl });
			}),
			delete: vi.fn(async (key: string) => {
				calls.deletes++;
				store.delete(key);
			}),
			list: vi.fn(),
			getWithMetadata: vi.fn(),
		} as unknown as KVNamespace,
	};
}

function makeCliTokenRow(hash = "hash-abc"): CliTokenRow {
	return {
		id: 7,
		token_hash: hash,
		label: "ci",
		scope: "assets",
		created_at: 1_700_000_000,
		last_used_at: null,
	};
}

function buildAssetApp(opts: {
	kv?: KVNamespace;
	storedRow: CliTokenRow | null;
	throwOnFind?: boolean;
}) {
	const findByHashAndTouch = vi.fn(async (_hash: string) => {
		if (opts.throwOnFind) {
			throw new Error("d1 outage");
		}
		return opts.storedRow;
	});

	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.env = {
			DB: {} as D1Database,
			BAT_WRITE_KEY: WRITE_KEY,
			BAT_READ_KEY: READ_KEY,
			BAT_KV: opts.kv,
		};
		c.set("repos", {
			cliTokens: {
				findByHashAndTouch,
			},
		} as unknown as AppEnv["Variables"]["repos"]);
		return next();
	});
	app.use("/api/*", apiKeyAuth);
	app.get("/api/agents", (c) => c.json([]));
	return { app, findByHashAndTouch };
}

describe("apiKeyAuth CLI token KV cache (Task #14 T1)", () => {
	test("cache miss → D1 lookup → cache populate", async () => {
		const { kv, store } = makeKv();
		const row = makeCliTokenRow();
		const { app, findByHashAndTouch } = buildAssetApp({ kv, storedRow: row });

		const plaintext = "raw-cli-token";
		const { hashToken } = await import("../domain/cli-token");
		const hash = await hashToken(plaintext);
		// Override stored hash so it actually matches the lookup
		row.token_hash = hash;

		const res = await app.request(
			new Request("http://bat-ingest.worker.hexly.ai/api/agents", {
				method: "GET",
				headers: { Authorization: `Bearer ${plaintext}`, host: "bat-ingest.worker.hexly.ai" },
			}),
		);

		expect(res.status).toBe(200);
		expect(findByHashAndTouch).toHaveBeenCalledTimes(1);
		expect(store.has(tokenCacheKey(hash))).toBe(true);
	});

	test("cache hit → no D1 lookup", async () => {
		const { kv } = makeKv();
		const row = makeCliTokenRow();
		const plaintext = "raw-cli-token-2";
		const { hashToken } = await import("../domain/cli-token");
		const hash = await hashToken(plaintext);
		row.token_hash = hash;
		await rememberToken(kv, row);

		const { app, findByHashAndTouch } = buildAssetApp({ kv, storedRow: row });

		const res = await app.request(
			new Request("http://bat-ingest.worker.hexly.ai/api/agents", {
				method: "GET",
				headers: { Authorization: `Bearer ${plaintext}`, host: "bat-ingest.worker.hexly.ai" },
			}),
		);

		expect(res.status).toBe(200);
		expect(findByHashAndTouch).not.toHaveBeenCalled();
	});

	test("revoked sentinel rejects auth with 403 even when cache + D1 still hold the token", async () => {
		const { kv, store } = makeKv();
		const row = makeCliTokenRow();
		const plaintext = "raw-cli-token-3";
		const { hashToken } = await import("../domain/cli-token");
		const hash = await hashToken(plaintext);
		row.token_hash = hash;
		await rememberToken(kv, row);
		// Mark revoked without removing the cache entry to simulate a stale cache
		store.set(tokenRevokedKey(hash), { value: "1" });

		const { app, findByHashAndTouch } = buildAssetApp({ kv, storedRow: row });

		const res = await app.request(
			new Request("http://bat-ingest.worker.hexly.ai/api/agents", {
				method: "GET",
				headers: { Authorization: `Bearer ${plaintext}`, host: "bat-ingest.worker.hexly.ai" },
			}),
		);

		expect(res.status).toBe(403);
		expect(findByHashAndTouch).not.toHaveBeenCalled();
	});

	test("KV throw on read → fallback to D1 lookup", async () => {
		const { kv } = makeKv();
		(kv.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("kv outage"));

		const row = makeCliTokenRow();
		const plaintext = "raw-cli-token-4";
		const { hashToken } = await import("../domain/cli-token");
		const hash = await hashToken(plaintext);
		row.token_hash = hash;

		const { app, findByHashAndTouch } = buildAssetApp({ kv, storedRow: row });

		const res = await app.request(
			new Request("http://bat-ingest.worker.hexly.ai/api/agents", {
				method: "GET",
				headers: { Authorization: `Bearer ${plaintext}`, host: "bat-ingest.worker.hexly.ai" },
			}),
		);

		expect(res.status).toBe(200);
		expect(findByHashAndTouch).toHaveBeenCalledTimes(1);
	});

	test("no BAT_KV binding → behaviour identical to pre-T1 (D1 every request)", async () => {
		const row = makeCliTokenRow();
		const plaintext = "raw-cli-token-5";
		const { hashToken } = await import("../domain/cli-token");
		const hash = await hashToken(plaintext);
		row.token_hash = hash;

		const { app, findByHashAndTouch } = buildAssetApp({ storedRow: row });

		for (let i = 0; i < 3; i++) {
			const res = await app.request(
				new Request("http://bat-ingest.worker.hexly.ai/api/agents", {
					method: "GET",
					headers: { Authorization: `Bearer ${plaintext}`, host: "bat-ingest.worker.hexly.ai" },
				}),
			);
			expect(res.status).toBe(200);
		}
		expect(findByHashAndTouch).toHaveBeenCalledTimes(3);
	});

	test("invalid token still returns 403 and does NOT populate cache", async () => {
		const { kv, store } = makeKv();
		const { app, findByHashAndTouch } = buildAssetApp({ kv, storedRow: null });

		const res = await app.request(
			new Request("http://bat-ingest.worker.hexly.ai/api/agents", {
				method: "GET",
				headers: { Authorization: "Bearer not-a-token", host: "bat-ingest.worker.hexly.ai" },
			}),
		);

		expect(res.status).toBe(403);
		expect(findByHashAndTouch).toHaveBeenCalledTimes(1);
		expect(store.size).toBe(0);
	});
});
