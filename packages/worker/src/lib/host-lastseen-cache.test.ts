import { describe, expect, test, vi } from "vitest";
import {
	HOST_LAST_SEEN_FLUSH_SECONDS,
	HOST_LAST_SEEN_TTL_SECONDS,
	type HostLastSeenSnapshot,
	freshestLastSeen,
	hostLastSeenKey,
	loadLastSeen,
	loadObservedSeenBatch,
	recordSnapshot,
	shouldFlushLastSeen,
} from "./host-lastseen-cache";

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
			delete: vi.fn(),
			list: vi.fn(),
			getWithMetadata: vi.fn(),
		} as unknown as KVNamespace,
	};
}

const sample: HostLastSeenSnapshot = {
	last_observed_at: 1_700_000_000,
	last_flush_at: 1_700_000_000,
};

describe("hostLastSeenKey", () => {
	test("composes bat:host:lastseen:{id}", () => {
		expect(hostLastSeenKey("h-1")).toBe("bat:host:lastseen:h-1");
	});
});

describe("loadLastSeen", () => {
	test("returns null when binding absent", async () => {
		expect(await loadLastSeen(undefined, "h")).toBeNull();
	});
	test("returns null on miss", async () => {
		const { kv } = makeKv();
		expect(await loadLastSeen(kv, "h")).toBeNull();
	});
	test("returns the snapshot when present", async () => {
		const { kv } = makeKv();
		await recordSnapshot(kv, "h", sample);
		expect(await loadLastSeen(kv, "h")).toEqual(sample);
	});
	test("returns null on KV throw (fallback)", async () => {
		const { kv } = makeKv();
		(kv.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("kv outage"));
		expect(await loadLastSeen(kv, "h")).toBeNull();
	});
});

describe("recordSnapshot", () => {
	test("writes snapshot with the configured TTL", async () => {
		const { kv, store } = makeKv();
		await recordSnapshot(kv, "h", sample);
		expect(store.get("bat:host:lastseen:h")?.ttl).toBe(HOST_LAST_SEEN_TTL_SECONDS);
	});
	test("no-ops when binding absent", async () => {
		await expect(recordSnapshot(undefined, "h", sample)).resolves.toBeUndefined();
	});
	test("swallows KV.put errors", async () => {
		const { kv } = makeKv();
		(kv.put as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("kv full"));
		await expect(recordSnapshot(kv, "h", sample)).resolves.toBeUndefined();
	});
});

describe("shouldFlushLastSeen", () => {
	test("flushes when no snapshot (first call / KV miss)", () => {
		expect(shouldFlushLastSeen({ now: 1_700_000_000, snapshot: null })).toBe(true);
	});
	test("does NOT flush within throttle window", () => {
		expect(
			shouldFlushLastSeen({
				now: sample.last_flush_at + HOST_LAST_SEEN_FLUSH_SECONDS - 1,
				snapshot: sample,
			}),
		).toBe(false);
	});
	test("flushes exactly at throttle window boundary", () => {
		expect(
			shouldFlushLastSeen({
				now: sample.last_flush_at + HOST_LAST_SEEN_FLUSH_SECONDS,
				snapshot: sample,
			}),
		).toBe(true);
	});
	test("custom throttleSeconds overrides default", () => {
		expect(
			shouldFlushLastSeen({
				now: sample.last_flush_at + 31,
				snapshot: sample,
				throttleSeconds: 30,
			}),
		).toBe(true);
	});
});

describe("loadObservedSeenBatch", () => {
	test("empty when binding absent or empty hostIds", async () => {
		expect((await loadObservedSeenBatch(undefined, ["a", "b"])).size).toBe(0);
		const { kv } = makeKv();
		expect((await loadObservedSeenBatch(kv, [])).size).toBe(0);
	});
	test("returns map of host_id → last_observed_at for hosts with snapshots", async () => {
		const { kv } = makeKv();
		await recordSnapshot(kv, "a", { last_observed_at: 100, last_flush_at: 50 });
		await recordSnapshot(kv, "b", { last_observed_at: 200, last_flush_at: 200 });
		const map = await loadObservedSeenBatch(kv, ["a", "b", "missing"]);
		expect(map.get("a")).toBe(100);
		expect(map.get("b")).toBe(200);
		expect(map.has("missing")).toBe(false);
	});
});

describe("freshestLastSeen", () => {
	test("returns D1 value when overlay missing", () => {
		expect(freshestLastSeen(100, undefined)).toBe(100);
	});
	test("returns overlay when fresher than D1", () => {
		expect(freshestLastSeen(100, 200)).toBe(200);
	});
	test("returns D1 when D1 ≥ overlay (e.g. recent flush)", () => {
		expect(freshestLastSeen(200, 150)).toBe(200);
		expect(freshestLastSeen(200, 200)).toBe(200);
	});
});

describe("TTL invariant", () => {
	test("TTL > throttle so snapshot does not expire mid-window", () => {
		expect(HOST_LAST_SEEN_TTL_SECONDS).toBeGreaterThan(HOST_LAST_SEEN_FLUSH_SECONDS);
	});
});
