import { describe, expect, test, vi } from "vitest";
import {
	ALERTS_HEALTHY_SENTINEL_TTL_SECONDS,
	alertsHealthySentinelKey,
	invalidateHealthy,
	isMarkedHealthy,
	markHealthy,
} from "./alerts-healthy-cache";

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

describe("alertsHealthySentinelKey", () => {
	test("uses bat:host:alerts:empty: prefix", () => {
		expect(alertsHealthySentinelKey("h-1")).toBe("bat:host:alerts:empty:h-1");
	});
});

describe("isMarkedHealthy", () => {
	test("false when KV binding is absent", async () => {
		expect(await isMarkedHealthy(undefined, "h")).toBe(false);
	});

	test("false when sentinel missing", async () => {
		const { kv } = makeKv();
		expect(await isMarkedHealthy(kv, "h")).toBe(false);
	});

	test("true when sentinel present", async () => {
		const { kv } = makeKv();
		await markHealthy(kv, "h");
		expect(await isMarkedHealthy(kv, "h")).toBe(true);
	});

	test("treats KV throw as not-marked (fallback path)", async () => {
		const { kv } = makeKv();
		(kv.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("kv outage"));
		expect(await isMarkedHealthy(kv, "h")).toBe(false);
	});
});

describe("markHealthy", () => {
	test("writes sentinel with the configured TTL", async () => {
		const { kv, store } = makeKv();
		await markHealthy(kv, "h");
		expect(store.get("bat:host:alerts:empty:h")?.value).toBe("1");
		expect(store.get("bat:host:alerts:empty:h")?.ttl).toBe(ALERTS_HEALTHY_SENTINEL_TTL_SECONDS);
	});

	test("no-ops when KV is absent", async () => {
		await expect(markHealthy(undefined, "h")).resolves.toBeUndefined();
	});

	test("swallows KV.put errors", async () => {
		const { kv } = makeKv();
		(kv.put as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("kv full"));
		await expect(markHealthy(kv, "h")).resolves.toBeUndefined();
	});
});

describe("invalidateHealthy", () => {
	test("deletes the sentinel", async () => {
		const { kv, store } = makeKv();
		await markHealthy(kv, "h");
		await invalidateHealthy(kv, "h");
		expect(store.has("bat:host:alerts:empty:h")).toBe(false);
	});

	test("no-ops when KV is absent", async () => {
		await expect(invalidateHealthy(undefined, "h")).resolves.toBeUndefined();
	});

	test("swallows KV.delete errors", async () => {
		const { kv } = makeKv();
		(kv.delete as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("kv outage"));
		await expect(invalidateHealthy(kv, "h")).resolves.toBeUndefined();
	});
});
