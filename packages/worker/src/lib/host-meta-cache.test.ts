import { describe, expect, test, vi } from "vitest";
import {
	HOST_META_TTL_SECONDS,
	type HostMetaProjection,
	hostMetaKey,
	invalidateHostMeta,
	loadHostMeta,
	storeHostMeta,
} from "./host-meta-cache";

interface PutEntry {
	value: string;
	ttl?: number;
}

function makeKv() {
	const store = new Map<string, PutEntry>();
	return {
		store,
		kv: {
			get: vi.fn(async (key: string, type?: "json" | "text") => {
				const entry = store.get(key);
				if (!entry) {
					return null;
				}
				return type === "json" ? JSON.parse(entry.value) : entry.value;
			}),
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

const sample: HostMetaProjection = {
	is_active: 1,
	maintenance_start: "01:00",
	maintenance_end: "02:00",
};

describe("hostMetaKey", () => {
	test("composes bat:host:meta:{id}", () => {
		expect(hostMetaKey("h-1")).toBe("bat:host:meta:h-1");
	});
});

describe("loadHostMeta", () => {
	test("returns null when binding absent", async () => {
		expect(await loadHostMeta(undefined, "h")).toBeNull();
	});

	test("returns null on miss", async () => {
		const { kv } = makeKv();
		expect(await loadHostMeta(kv, "h")).toBeNull();
	});

	test("returns the stored projection on hit", async () => {
		const { kv } = makeKv();
		await storeHostMeta(kv, "h", sample);
		expect(await loadHostMeta(kv, "h")).toEqual(sample);
	});

	test("returns null on KV throw (fallback)", async () => {
		const { kv } = makeKv();
		(kv.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("kv outage"));
		expect(await loadHostMeta(kv, "h")).toBeNull();
	});

	test("retired host projection (is_active=0) is cached and returned", async () => {
		const { kv } = makeKv();
		await storeHostMeta(kv, "h", { is_active: 0, maintenance_start: null, maintenance_end: null });
		const hit = await loadHostMeta(kv, "h");
		expect(hit?.is_active).toBe(0);
	});
});

describe("storeHostMeta", () => {
	test("writes with the configured TTL", async () => {
		const { kv, store } = makeKv();
		await storeHostMeta(kv, "h", sample);
		expect(store.get("bat:host:meta:h")?.ttl).toBe(HOST_META_TTL_SECONDS);
	});

	test("never caches null (first-seen host must not be masked by negative cache)", async () => {
		const { kv, store } = makeKv();
		await storeHostMeta(kv, "h", null);
		expect(store.size).toBe(0);
	});

	test("no-ops when binding absent", async () => {
		await expect(storeHostMeta(undefined, "h", sample)).resolves.toBeUndefined();
	});

	test("swallows KV.put errors", async () => {
		const { kv } = makeKv();
		(kv.put as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("kv full"));
		await expect(storeHostMeta(kv, "h", sample)).resolves.toBeUndefined();
	});
});

describe("invalidateHostMeta", () => {
	test("deletes the projection", async () => {
		const { kv, store } = makeKv();
		await storeHostMeta(kv, "h", sample);
		await invalidateHostMeta(kv, "h");
		expect(store.has("bat:host:meta:h")).toBe(false);
	});

	test("no-ops when binding absent", async () => {
		await expect(invalidateHostMeta(undefined, "h")).resolves.toBeUndefined();
	});

	test("swallows KV.delete errors", async () => {
		const { kv } = makeKv();
		(kv.delete as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("kv outage"));
		await expect(invalidateHostMeta(kv, "h")).resolves.toBeUndefined();
	});
});
