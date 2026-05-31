// Route tests for /api/cli-tokens — focus on Task #14 T1's revoke sentinel
// behaviour. The list route is a thin DTO mapping covered by the adapter
// contract test; here we cover delete invalidating the KV cache + writing
// the revoked sentinel.

import { Hono } from "hono";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { tokenCacheKey, tokenRevokedKey } from "../lib/cli-token-cache";
import type { AppEnv } from "../types";
import { cliTokensDeleteRoute } from "./cli-tokens";

interface PutEntry {
	value: string;
	expirationTtl?: number;
}

function makeKv() {
	const store = new Map<string, PutEntry>();
	return {
		store,
		kv: {
			get: vi.fn(async (key: string) => store.get(key)?.value ?? null),
			put: vi.fn(async (key: string, value: string, opts?: { expirationTtl?: number }) => {
				store.set(key, { value, expirationTtl: opts?.expirationTtl });
			}),
			delete: vi.fn(async (key: string) => {
				store.delete(key);
			}),
			list: vi.fn(),
			getWithMetadata: vi.fn(),
		} as unknown as KVNamespace,
	};
}

function buildApp(opts: {
	kv?: KVNamespace;
	storedHash?: string | null;
	deleteResult?: boolean;
	deleteThrows?: boolean;
}) {
	const findHashById = vi.fn(async (_id: number) =>
		opts.storedHash === undefined ? null : opts.storedHash,
	);
	const deleteFn = vi.fn(async (_id: number) => {
		if (opts.deleteThrows) {
			throw new Error("d1 outage");
		}
		return opts.deleteResult ?? true;
	});

	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.env = {
			DB: {} as D1Database,
			BAT_WRITE_KEY: "w",
			BAT_READ_KEY: "r",
			BAT_KV: opts.kv,
		};
		c.set("repos", {
			cliTokens: {
				findHashById,
				delete: deleteFn,
			},
		} as unknown as AppEnv["Variables"]["repos"]);
		return next();
	});
	app.delete("/api/cli-tokens/:id", cliTokensDeleteRoute);
	return { app, findHashById, deleteFn };
}

describe("cliTokensDeleteRoute (Task #14 T1)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test("deletes row, writes revoked sentinel, removes positive cache", async () => {
		const { kv, store } = makeKv();
		const hash = "deadbeef";
		// Pre-populate positive cache to mirror an active session
		store.set(tokenCacheKey(hash), { value: '{"id":1,"token_hash":"deadbeef"}' });
		const { app } = buildApp({ kv, storedHash: hash, deleteResult: true });

		const res = await app.request(
			new Request("http://localhost/api/cli-tokens/1", { method: "DELETE" }),
		);
		expect(res.status).toBe(204);
		expect(store.get(tokenRevokedKey(hash))?.value).toBe("1");
		expect(store.has(tokenCacheKey(hash))).toBe(false);
	});

	test("returns 400 on non-numeric id and does NOT touch KV or D1", async () => {
		const { kv, store } = makeKv();
		const { app, deleteFn, findHashById } = buildApp({ kv, storedHash: "x" });

		const res = await app.request(
			new Request("http://localhost/api/cli-tokens/abc", { method: "DELETE" }),
		);
		expect(res.status).toBe(400);
		expect(deleteFn).not.toHaveBeenCalled();
		expect(findHashById).not.toHaveBeenCalled();
		expect(store.size).toBe(0);
	});

	test("returns 404 when D1 reports no rows changed; does NOT write sentinel", async () => {
		const { kv, store } = makeKv();
		const { app } = buildApp({ kv, storedHash: "x", deleteResult: false });

		const res = await app.request(
			new Request("http://localhost/api/cli-tokens/1", { method: "DELETE" }),
		);
		expect(res.status).toBe(404);
		expect(store.size).toBe(0);
	});

	test("works without BAT_KV binding (no-op revoke)", async () => {
		const { app } = buildApp({ storedHash: "x", deleteResult: true });
		const res = await app.request(
			new Request("http://localhost/api/cli-tokens/1", { method: "DELETE" }),
		);
		expect(res.status).toBe(204);
	});

	test("survives KV failure during sentinel write", async () => {
		const { kv } = makeKv();
		(kv.put as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("kv outage"));
		const { app } = buildApp({ kv, storedHash: "x", deleteResult: true });
		const res = await app.request(
			new Request("http://localhost/api/cli-tokens/1", { method: "DELETE" }),
		);
		expect(res.status).toBe(204);
	});
});
