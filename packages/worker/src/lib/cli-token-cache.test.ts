import type { CliTokenRow } from "@bat/shared";
import { describe, expect, test, vi } from "vitest";
import {
	CLI_TOKEN_CACHE_TTL_SECONDS,
	CLI_TOKEN_REVOKED_TTL_SECONDS,
	lookupToken,
	markRevoked,
	rememberToken,
	tokenCacheKey,
	tokenRevokedKey,
} from "./cli-token-cache";

interface PutEntry {
	value: string;
	expirationTtl?: number;
}

function makeKv(): KVNamespace & {
	store: Map<string, PutEntry>;
	puts: { key: string; value: string; ttl?: number }[];
	deletes: string[];
} {
	const store = new Map<string, PutEntry>();
	const puts: { key: string; value: string; ttl?: number }[] = [];
	const deletes: string[] = [];
	const kv = {
		store,
		puts,
		deletes,
		get: vi.fn(async (key: string, type?: "json" | "text") => {
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
			store.set(key, { value, expirationTtl: opts?.expirationTtl });
			puts.push({ key, value, ttl: opts?.expirationTtl });
		}),
		delete: vi.fn(async (key: string) => {
			store.delete(key);
			deletes.push(key);
		}),
		list: vi.fn(),
		getWithMetadata: vi.fn(),
	} as unknown as KVNamespace & {
		store: Map<string, PutEntry>;
		puts: { key: string; value: string; ttl?: number }[];
		deletes: string[];
	};
	return kv;
}

const sampleRow: CliTokenRow = {
	id: 42,
	token_hash: "abc123",
	label: "ci-bot",
	scope: "assets",
	created_at: 1_700_000_000,
	last_used_at: 1_700_001_000,
};

describe("cli-token-cache key helpers", () => {
	test("cache key uses bat:clitoken: prefix", () => {
		expect(tokenCacheKey("h")).toBe("bat:clitoken:h");
	});
	test("revoked key uses bat:clitoken:revoked: prefix", () => {
		expect(tokenRevokedKey("h")).toBe("bat:clitoken:revoked:h");
	});
});

describe("lookupToken", () => {
	test("returns miss when KV binding is undefined", async () => {
		const result = await lookupToken(undefined, "abc123");
		expect(result).toEqual({ miss: true });
	});

	test("returns miss when neither key is present", async () => {
		const kv = makeKv();
		const result = await lookupToken(kv, "abc123");
		expect(result).toEqual({ miss: true });
	});

	test("returns hit with reconstructed row when cache key present", async () => {
		const kv = makeKv();
		await rememberToken(kv, sampleRow);
		const result = await lookupToken(kv, "abc123");
		expect("hit" in result && result.hit).toBeTruthy();
		if ("hit" in result) {
			expect(result.hit.id).toBe(42);
			expect(result.hit.token_hash).toBe("abc123");
			expect(result.hit.scope).toBe("assets");
			// last_used_at intentionally null on cache hit (D1 5min flush precision)
			expect(result.hit.last_used_at).toBeNull();
		}
	});

	test("revoked sentinel takes precedence over a stale cache hit", async () => {
		const kv = makeKv();
		await rememberToken(kv, sampleRow);
		await markRevoked(kv, "abc123");
		const result = await lookupToken(kv, "abc123");
		expect(result).toEqual({ revoked: true });
	});

	test("treats KV throw as miss (fallback path)", async () => {
		const kv = makeKv();
		(kv.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("kv outage"));
		const result = await lookupToken(kv, "abc123");
		expect(result).toEqual({ miss: true });
	});
});

describe("rememberToken", () => {
	test("writes positive cache with the configured TTL", async () => {
		const kv = makeKv();
		await rememberToken(kv, sampleRow);
		expect(kv.puts).toHaveLength(1);
		expect(kv.puts[0].key).toBe("bat:clitoken:abc123");
		expect(kv.puts[0].ttl).toBe(CLI_TOKEN_CACHE_TTL_SECONDS);
		const stored = JSON.parse(kv.puts[0].value);
		expect(stored.id).toBe(42);
		expect(stored.token_hash).toBe("abc123");
	});

	test("no-ops when KV binding is absent", async () => {
		await expect(rememberToken(undefined, sampleRow)).resolves.toBeUndefined();
	});

	test("swallows KV.put errors", async () => {
		const kv = makeKv();
		(kv.put as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("kv full"));
		await expect(rememberToken(kv, sampleRow)).resolves.toBeUndefined();
	});
});

describe("markRevoked", () => {
	test("writes revoke sentinel and deletes positive cache", async () => {
		const kv = makeKv();
		await rememberToken(kv, sampleRow);
		await markRevoked(kv, "abc123");
		expect(kv.puts).toHaveLength(2);
		const sentinel = kv.puts[1];
		expect(sentinel.key).toBe("bat:clitoken:revoked:abc123");
		expect(sentinel.value).toBe("1");
		expect(sentinel.ttl).toBe(CLI_TOKEN_REVOKED_TTL_SECONDS);
		expect(kv.deletes).toEqual(["bat:clitoken:abc123"]);
	});

	test("no-ops when KV binding is absent", async () => {
		await expect(markRevoked(undefined, "abc123")).resolves.toBeUndefined();
	});

	test("still attempts cache delete when sentinel write throws", async () => {
		const kv = makeKv();
		(kv.put as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("kv outage"));
		await expect(markRevoked(kv, "abc123")).resolves.toBeUndefined();
		expect(kv.deletes).toEqual(["bat:clitoken:abc123"]);
	});

	test("swallows delete errors so sentinel write still counts", async () => {
		const kv = makeKv();
		(kv.delete as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("kv outage"));
		await expect(markRevoked(kv, "abc123")).resolves.toBeUndefined();
		// Sentinel was still written before delete failed
		expect(kv.store.get("bat:clitoken:revoked:abc123")?.value).toBe("1");
	});
});

describe("revoke sentinel TTL invariant", () => {
	test("revoke TTL >= positive cache TTL so cache cannot resurrect a revoked token", () => {
		expect(CLI_TOKEN_REVOKED_TTL_SECONDS).toBeGreaterThanOrEqual(CLI_TOKEN_CACHE_TTL_SECONDS);
	});
});
