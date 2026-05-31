import { describe, expect, test, vi } from "vitest";
import { buildCacheKey, tryReadCache, writeCache } from "./dashboard-cache";

interface PutEntry {
	value: string;
	ttl?: number;
}

function makeKv() {
	const store = new Map<string, PutEntry>();
	return {
		store,
		kv: {
			get: vi.fn(async (key: string) => store.get(key)?.value ?? null),
			put: vi.fn(async (key: string, value: string, opts?: { expirationTtl?: number }) => {
				store.set(key, { value, ttl: opts?.expirationTtl });
			}),
			delete: vi.fn(async (key: string) => {
				store.delete(key);
			}),
			list: vi.fn(),
			getWithMetadata: vi.fn(),
		} as unknown as KVNamespace,
	};
}

describe("buildCacheKey", () => {
	test("starts with bat:dash:{route}:", async () => {
		const r = new Request("https://x/api/hosts");
		const key = await buildCacheKey(r, "hosts");
		expect(key.startsWith("bat:dash:hosts:")).toBe(true);
	});

	test("differs for different auth identities", async () => {
		const a = await buildCacheKey(
			new Request("https://x/api/hosts", { headers: { Authorization: "Bearer A" } }),
			"hosts",
		);
		const b = await buildCacheKey(
			new Request("https://x/api/hosts", { headers: { Authorization: "Bearer B" } }),
			"hosts",
		);
		expect(a).not.toBe(b);
	});

	test("differs for different paths/queries", async () => {
		const a = await buildCacheKey(new Request("https://x/api/hosts"), "hosts");
		const b = await buildCacheKey(new Request("https://x/api/hosts?limit=1"), "hosts");
		expect(a).not.toBe(b);
	});

	test("differs for different routes (so /hosts and /alerts can't collide)", async () => {
		const a = await buildCacheKey(new Request("https://x/api/x"), "hosts");
		const b = await buildCacheKey(new Request("https://x/api/x"), "alerts");
		expect(a).not.toBe(b);
	});

	test("falls back to anon segment when no auth header is present", async () => {
		const k = await buildCacheKey(new Request("https://x/api/hosts"), "hosts");
		expect(k).toContain(":anon:");
	});

	test("Cf-Access-Jwt-Assertion is treated as auth identity (browser path)", async () => {
		const k = await buildCacheKey(
			new Request("https://x/api/hosts", { headers: { "Cf-Access-Jwt-Assertion": "jwt" } }),
			"hosts",
		);
		expect(k).not.toContain(":anon:");
	});

	test("never embeds the literal auth value", async () => {
		const k = await buildCacheKey(
			new Request("https://x/api/hosts", {
				headers: { Authorization: "Bearer SECRET-VALUE-XYZ" },
			}),
			"hosts",
		);
		expect(k).not.toContain("SECRET-VALUE-XYZ");
	});

	test("auth digest sits in the KV key body, not in a URL fragment", async () => {
		// T4 v2 pin: digest must be in the KV key. Cache API and the WHATWG
		// fetch matching strip URL fragments, which would silently merge
		// auth variants if the digest lived in `#...`.
		const k = await buildCacheKey(
			new Request("https://x/api/hosts", { headers: { Authorization: "Bearer A" } }),
			"hosts",
		);
		expect(k).not.toContain("#");
	});
});

describe("tryReadCache / writeCache round-trip", () => {
	test("miss → null without throwing", async () => {
		const { kv } = makeKv();
		const r = new Request("https://x/api/hosts");
		expect(await tryReadCache(kv, r, { route: "hosts", ttlSeconds: 30 })).toBeNull();
	});

	test("write then read returns a 200 JSON response with cache headers", async () => {
		const { kv, store } = makeKv();
		const r = new Request("https://x/api/hosts", {
			headers: { Authorization: "Bearer A" },
		});
		const original = new Response(JSON.stringify([{ id: 1 }]), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
		await writeCache(kv, r, original, { route: "hosts", ttlSeconds: 30 });
		expect(store.size).toBe(1);

		const hit = await tryReadCache(kv, r, { route: "hosts", ttlSeconds: 30 });
		expect(hit).not.toBeNull();
		expect(hit?.status).toBe(200);
		expect(hit?.headers.get("Content-Type")).toBe("application/json");
		expect(hit?.headers.get("Cache-Control")).toBe("max-age=30");
		expect(hit?.headers.get("X-Bat-Cache")).toBe("hit");
		expect(await hit?.text()).toBe(JSON.stringify([{ id: 1 }]));
	});

	test("ttl is propagated as KV expirationTtl", async () => {
		const { kv, store } = makeKv();
		const r = new Request("https://x/api/hosts");
		await writeCache(kv, r, new Response("[]", { status: 200 }), {
			route: "hosts",
			ttlSeconds: 45,
		});
		const [entry] = [...store.values()];
		expect(entry.ttl).toBe(45);
	});

	test("two requests with different auth do NOT share entries", async () => {
		const { kv } = makeKv();
		const a = new Request("https://x/api/hosts", { headers: { Authorization: "Bearer A" } });
		const b = new Request("https://x/api/hosts", { headers: { Authorization: "Bearer B" } });
		await writeCache(kv, a, new Response("for-A", { status: 200 }), {
			route: "hosts",
			ttlSeconds: 30,
		});
		expect(await (await tryReadCache(kv, a, { route: "hosts", ttlSeconds: 30 }))?.text()).toBe(
			"for-A",
		);
		expect(await tryReadCache(kv, b, { route: "hosts", ttlSeconds: 30 })).toBeNull();
	});

	test("non-200 responses are NOT cached", async () => {
		const { kv, store } = makeKv();
		const r = new Request("https://x/api/hosts");
		await writeCache(kv, r, new Response("err", { status: 500 }), {
			route: "hosts",
			ttlSeconds: 30,
		});
		expect(store.size).toBe(0);
	});

	test("KV throw on read → null (fallback to handler)", async () => {
		const { kv } = makeKv();
		(kv.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("kv outage"));
		const r = new Request("https://x/api/hosts");
		expect(await tryReadCache(kv, r, { route: "hosts", ttlSeconds: 30 })).toBeNull();
	});

	test("KV throw on write → swallowed", async () => {
		const { kv } = makeKv();
		(kv.put as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("kv full"));
		const r = new Request("https://x/api/hosts");
		await expect(
			writeCache(kv, r, new Response("ok", { status: 200 }), {
				route: "hosts",
				ttlSeconds: 30,
			}),
		).resolves.toBeUndefined();
	});

	test("undefined kv binding → both helpers no-op safely (pre-T4 behaviour)", async () => {
		const r = new Request("https://x/api/hosts");
		expect(await tryReadCache(undefined, r, { route: "hosts", ttlSeconds: 30 })).toBeNull();
		await expect(
			writeCache(undefined, r, new Response("ok", { status: 200 }), {
				route: "hosts",
				ttlSeconds: 30,
			}),
		).resolves.toBeUndefined();
	});

	test("response body is not consumed by writeCache (caller can still read it)", async () => {
		const { kv } = makeKv();
		const r = new Request("https://x/api/hosts");
		const original = new Response("payload", { status: 200 });
		await writeCache(kv, r, original, { route: "hosts", ttlSeconds: 30 });
		expect(await original.text()).toBe("payload");
	});
});
