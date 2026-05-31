import { describe, expect, test, vi } from "vitest";
import {
	HEARTBEAT_SNAPSHOT_TTL_SECONDS,
	HEARTBEAT_THROTTLE_SECONDS,
	type HeartbeatSnapshot,
	loadSnapshot,
	shouldFlush,
	snapshotKey,
	writeSnapshot,
} from "./heartbeat-cache";

interface PutEntry {
	value: string;
	ttl?: number;
}

function makeKv(): KVNamespace & { store: Map<string, PutEntry> } {
	const store = new Map<string, PutEntry>();
	const kv = {
		store,
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
			store.set(key, { value, ttl: opts?.expirationTtl });
		}),
		delete: vi.fn(),
		list: vi.fn(),
		getWithMetadata: vi.fn(),
	} as unknown as KVNamespace & { store: Map<string, PutEntry> };
	return kv;
}

const baseSnapshot: HeartbeatSnapshot = {
	status: "running",
	runtime_app: "bun",
	runtime_version: "1.2.3",
	last_flush_at: 1_700_000_000,
};

describe("snapshotKey", () => {
	test("composes bat:agent:state:{src}:{match} prefix", () => {
		expect(snapshotKey("src-1", "match-A")).toBe("bat:agent:state:src-1:match-A");
	});
});

describe("loadSnapshot", () => {
	test("returns null when KV binding is undefined", async () => {
		expect(await loadSnapshot(undefined, "s", "m")).toBeNull();
	});

	test("returns null on miss", async () => {
		const kv = makeKv();
		expect(await loadSnapshot(kv, "s", "m")).toBeNull();
	});

	test("returns the snapshot when present", async () => {
		const kv = makeKv();
		await writeSnapshot(kv, "s", "m", baseSnapshot);
		expect(await loadSnapshot(kv, "s", "m")).toEqual(baseSnapshot);
	});

	test("returns null on KV throw (fallback path)", async () => {
		const kv = makeKv();
		(kv.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("kv outage"));
		expect(await loadSnapshot(kv, "s", "m")).toBeNull();
	});
});

describe("writeSnapshot", () => {
	test("writes with the configured TTL", async () => {
		const kv = makeKv();
		await writeSnapshot(kv, "s", "m", baseSnapshot);
		expect(kv.store.get("bat:agent:state:s:m")?.ttl).toBe(HEARTBEAT_SNAPSHOT_TTL_SECONDS);
	});

	test("no-ops when KV binding is absent", async () => {
		await expect(writeSnapshot(undefined, "s", "m", baseSnapshot)).resolves.toBeUndefined();
	});

	test("swallows KV.put errors", async () => {
		const kv = makeKv();
		(kv.put as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("kv full"));
		await expect(writeSnapshot(kv, "s", "m", baseSnapshot)).resolves.toBeUndefined();
	});
});

describe("shouldFlush", () => {
	const now = baseSnapshot.last_flush_at + 60; // 60s after last flush

	test("flushes when status changed", () => {
		expect(
			shouldFlush({
				now,
				existingStatus: "running",
				entryStatus: "stopped",
				entryRuntimeAppProvided: false,
				entryRuntimeApp: undefined,
				entryRuntimeVersionProvided: false,
				entryRuntimeVersion: undefined,
				snapshot: baseSnapshot,
			}),
		).toBe(true);
	});

	test("flushes when no snapshot is available (KV miss / first call)", () => {
		expect(
			shouldFlush({
				now,
				existingStatus: "running",
				entryStatus: "running",
				entryRuntimeAppProvided: false,
				entryRuntimeApp: undefined,
				entryRuntimeVersionProvided: false,
				entryRuntimeVersion: undefined,
				snapshot: null,
			}),
		).toBe(true);
	});

	test("flushes when last_flush_at is older than throttle window", () => {
		expect(
			shouldFlush({
				now: baseSnapshot.last_flush_at + HEARTBEAT_THROTTLE_SECONDS,
				existingStatus: "running",
				entryStatus: "running",
				entryRuntimeAppProvided: false,
				entryRuntimeApp: undefined,
				entryRuntimeVersionProvided: false,
				entryRuntimeVersion: undefined,
				snapshot: baseSnapshot,
			}),
		).toBe(true);
	});

	test("flushes when runtime_app changed (provided)", () => {
		expect(
			shouldFlush({
				now,
				existingStatus: "running",
				entryStatus: "running",
				entryRuntimeAppProvided: true,
				entryRuntimeApp: "node",
				entryRuntimeVersionProvided: false,
				entryRuntimeVersion: undefined,
				snapshot: baseSnapshot,
			}),
		).toBe(true);
	});

	test("flushes when runtime_version changed (provided)", () => {
		expect(
			shouldFlush({
				now,
				existingStatus: "running",
				entryStatus: "running",
				entryRuntimeAppProvided: false,
				entryRuntimeApp: undefined,
				entryRuntimeVersionProvided: true,
				entryRuntimeVersion: "9.9.9",
				snapshot: baseSnapshot,
			}),
		).toBe(true);
	});

	test("does NOT flush when status + runtime are unchanged within throttle", () => {
		expect(
			shouldFlush({
				now,
				existingStatus: "running",
				entryStatus: "running",
				entryRuntimeAppProvided: true,
				entryRuntimeApp: "bun",
				entryRuntimeVersionProvided: true,
				entryRuntimeVersion: "1.2.3",
				snapshot: baseSnapshot,
			}),
		).toBe(false);
	});

	test("ignores runtime fields that are not provided in the entry", () => {
		// Entry omits runtime fields → no comparison required, only status + window
		expect(
			shouldFlush({
				now,
				existingStatus: "running",
				entryStatus: "running",
				entryRuntimeAppProvided: false,
				entryRuntimeApp: undefined,
				entryRuntimeVersionProvided: false,
				entryRuntimeVersion: undefined,
				snapshot: baseSnapshot,
			}),
		).toBe(false);
	});

	test("treats explicit null === null as no change", () => {
		expect(
			shouldFlush({
				now,
				existingStatus: "running",
				entryStatus: "running",
				entryRuntimeAppProvided: true,
				entryRuntimeApp: null,
				entryRuntimeVersionProvided: true,
				entryRuntimeVersion: null,
				snapshot: { ...baseSnapshot, runtime_app: null, runtime_version: null },
			}),
		).toBe(false);
	});

	test("custom throttleSeconds overrides default", () => {
		expect(
			shouldFlush({
				now: baseSnapshot.last_flush_at + 31,
				existingStatus: "running",
				entryStatus: "running",
				entryRuntimeAppProvided: false,
				entryRuntimeApp: undefined,
				entryRuntimeVersionProvided: false,
				entryRuntimeVersion: undefined,
				snapshot: baseSnapshot,
				throttleSeconds: 30,
			}),
		).toBe(true);
	});
});

describe("snapshot TTL invariant", () => {
	test("TTL > throttle window so a snapshot does not expire mid-window", () => {
		expect(HEARTBEAT_SNAPSHOT_TTL_SECONDS).toBeGreaterThan(HEARTBEAT_THROTTLE_SECONDS);
	});
});
