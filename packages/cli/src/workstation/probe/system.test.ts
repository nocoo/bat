// Tests for native system collection.

import type { NetworkInterfaceInfo } from "node:os";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	collectDisks,
	collectIdentity,
	collectMemory,
	collectNetwork,
	cpuModel,
	cpuSampleDelay,
	cpuUsagePct,
	diskFromStats,
	diskMounts,
	parseMemAvailableKb,
	snapshotCpu,
} from "./system.js";

const GiB = 1024 ** 3;

function iface(address: string, family: "IPv4" | "IPv6", internal = false): NetworkInterfaceInfo {
	return {
		address,
		family,
		internal,
		netmask: family === "IPv4" ? "255.255.255.0" : "ffff::",
		mac: "00:00:00:00:00:00",
		cidr: null,
		scopeid: 0,
	} as unknown as NetworkInterfaceInfo;
}

afterEach(() => {
	vi.useRealTimers();
});

describe("CPU", () => {
	test("sums idle and total from cpu times", () => {
		const snapshot = snapshotCpu([
			{ model: "m", speed: 1, times: { user: 10, nice: 0, sys: 10, idle: 80, irq: 0 } },
			{ model: "m", speed: 1, times: { user: 20, nice: 0, sys: 0, idle: 60, irq: 20 } },
		]);
		expect(snapshot).toStrictEqual({ idle: 140, total: 200 });
	});

	test("computes usage from the delta and clamps the edges", () => {
		expect(cpuUsagePct({ idle: 100, total: 200 }, { idle: 150, total: 400 })).toBe(75);
		expect(cpuUsagePct({ idle: 0, total: 0 }, { idle: 0, total: 0 })).toBeNull();
		expect(cpuUsagePct({ idle: 100, total: 100 }, { idle: 400, total: 200 })).toBe(0);
		expect(cpuUsagePct({ idle: 100, total: 100 }, { idle: 100, total: 200 })).toBe(100);
	});

	test("falls back to a stable model name", () => {
		expect(
			cpuModel([
				{ model: " Apple M3 ", speed: 1, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } },
			]),
		).toBe("Apple M3");
		expect(cpuModel([])).toBe("unknown");
		const long = cpuModel([
			{ model: "x".repeat(200), speed: 1, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } },
		]);
		expect(long).toHaveLength(128);
	});

	test("cpuSampleDelay resolves after the bounded window", async () => {
		vi.useFakeTimers();
		const pending = cpuSampleDelay();
		await vi.advanceTimersByTimeAsync(250);
		await expect(pending).resolves.toBeUndefined();
	});
});

describe("memory", () => {
	test("parses MemAvailable from /proc/meminfo", () => {
		expect(parseMemAvailableKb("MemTotal: 100 kB\nMemAvailable: 2048 kB\n")).toBe(2048 * 1024);
		expect(parseMemAvailableKb("MemTotal: 100 kB\n")).toBeNull();
	});

	test("uses MemAvailable on Linux", async () => {
		const memory = await collectMemory({
			platform: "linux",
			total: 8 * GiB,
			free: () => 1 * GiB,
			readFile: async () => "MemAvailable: 3145728 kB\n",
		});
		expect(memory).toStrictEqual({
			total_bytes: 8 * GiB,
			available_bytes: 3 * GiB,
			used_pct: 62.5,
		});
	});

	test("falls back to free memory when meminfo is unreadable", async () => {
		const memory = await collectMemory({
			platform: "linux",
			total: 8 * GiB,
			free: () => 2 * GiB,
			readFile: async () => {
				throw new Error("ENOENT");
			},
		});
		expect(memory.available_bytes).toBe(2 * GiB);
	});

	test("uses the native meminfo reader and ignores a missing MemAvailable field", async () => {
		const fallback = await collectMemory({
			platform: "linux",
			total: 8 * GiB,
			free: () => 1 * GiB,
		});
		expect(fallback.available_bytes).toBeGreaterThanOrEqual(0);

		const missing = await collectMemory({
			platform: "linux",
			total: 8 * GiB,
			free: () => 2 * GiB,
			readFile: async () => "MemTotal: 8388608 kB\n",
		});
		expect(missing.available_bytes).toBe(2 * GiB);
	});

	test("uses the OS free value on other platforms", async () => {
		const memory = await collectMemory({
			platform: "darwin",
			total: 4 * GiB,
			free: () => 1 * GiB,
		});
		expect(memory.used_pct).toBe(75);
	});

	test("clamps impossible values", async () => {
		const over = await collectMemory({ platform: "darwin", total: 10, free: () => 20 });
		expect(over.available_bytes).toBe(10);
		expect(over.used_pct).toBe(0);
		const negative = await collectMemory({ platform: "darwin", total: 10, free: () => -5 });
		expect(negative.available_bytes).toBe(0);
		const zeroTotal = await collectMemory({ platform: "darwin", total: 0, free: () => 0 });
		expect(zeroTotal.total_bytes).toBe(1);
	});
});

describe("disk", () => {
	test("targets only the primary local volume", () => {
		expect(diskMounts("darwin", {})).toStrictEqual(["/"]);
		expect(diskMounts("linux", {})).toStrictEqual(["/"]);
		expect(diskMounts("win32", { SystemDrive: "D:" })).toStrictEqual(["D:\\"]);
		expect(diskMounts("win32", {})).toStrictEqual(["C:\\"]);
	});

	test("converts statfs output and rejects unusable values", () => {
		expect(diskFromStats("/", { bsize: 4096, blocks: 1000, bavail: 250 })).toStrictEqual({
			mount: "/",
			total_bytes: 4_096_000,
			available_bytes: 1_024_000,
			used_pct: 75,
		});
		expect(diskFromStats("/", { bsize: 4096, blocks: 0, bavail: 0 })).toBeNull();
		expect(diskFromStats("/", { bsize: Number.NaN, blocks: 1, bavail: 0 })).toBeNull();
		expect(diskFromStats("/", { bsize: 100, blocks: 10, bavail: 20 })?.available_bytes).toBe(1000);
	});

	test("collects the primary volume", async () => {
		const result = await collectDisks({
			platform: "darwin",
			statfs: async () => ({ bsize: 4096, blocks: 1000, bavail: 500 }),
		});
		expect(result.disk).toHaveLength(1);
		expect(result.errors).toStrictEqual([]);
	});

	test("records a bounded error instead of throwing", async () => {
		const result = await collectDisks({
			platform: "darwin",
			statfs: async () => {
				throw new Error("EACCES");
			},
		});
		expect(result.disk).toStrictEqual([]);
		expect(result.errors[0]).toContain("EACCES");
	});

	test("cancels a hanging statfs through the run signal", async () => {
		const controller = new AbortController();
		const pending = collectDisks({
			platform: "darwin",
			signal: controller.signal,
			statfs: (_path, options) =>
				new Promise((_resolve, reject) => {
					options?.signal?.addEventListener("abort", () => reject(new Error("cancelled")));
				}),
		});
		controller.abort();
		const result = await pending;
		expect(result.errors[0]).toContain("cancelled");
	});

	test("reports unusable statfs output", async () => {
		const result = await collectDisks({
			platform: "darwin",
			statfs: async () => ({ bsize: 0, blocks: 0, bavail: 0 }),
		});
		expect(result.errors[0]).toContain("unusable statfs");
	});
});

describe("network", () => {
	test("collects literal addresses only and never MAC data", () => {
		const result = collectNetwork({
			en0: [iface("192.168.1.5", "IPv4"), iface("fe80::1%en0", "IPv6"), iface("not-an-ip", "IPv4")],
			lo0: [iface("127.0.0.1", "IPv4", true), iface("::1", "IPv6", true)],
			weird: [
				{ ...iface("10.0.0.1", "IPv4"), family: "sctp" as unknown as "IPv4" },
				iface("10.0.0.1", "IPv4"),
				iface("10.0.0.1", "IPv4"),
			],
			empty: [],
		});
		expect(result.map((entry) => entry.name)).toStrictEqual(["en0", "lo0", "weird"]);
		expect(result[0]?.addresses).toStrictEqual([
			{ address: "192.168.1.5", family: 4, internal: false },
			{ address: "fe80::1", family: 6, internal: false },
		]);
		expect(result[1]?.addresses.every((address) => address.internal)).toBe(true);
		expect(result[2]?.addresses).toHaveLength(1);
		expect(JSON.stringify(result)).not.toContain("00:00:00");
	});

	test("skips interfaces declared without a value", () => {
		expect(collectNetwork({ ghost: undefined })).toStrictEqual([]);
	});

	test("caps addresses per interface and interfaces per report", () => {
		const addresses = Array.from({ length: 20 }, (_, index) =>
			iface(`10.0.0.${index + 1}`, "IPv4"),
		);
		const interfaces: Record<string, NetworkInterfaceInfo[]> = {
			en0: [iface("10.10.0.1", "IPv4")],
			en1: addresses,
		};
		for (let index = 0; index < 40; index += 1) {
			interfaces[`if${index}`] = [iface(`10.1.${index}.1`, "IPv4")];
		}
		const result = collectNetwork(interfaces);
		expect(result.length).toBeLessThanOrEqual(32);
		expect(result.find((entry) => entry.name === "en1")?.addresses).toHaveLength(16);
	});

	test("reads the live interface list by default", () => {
		expect(Array.isArray(collectNetwork())).toBe(true);
	});
});

describe("identity", () => {
	test("truncates every field to the shared bounds", () => {
		const identity = collectIdentity({
			hostname: "h".repeat(300),
			type: "t".repeat(200),
			release: "r",
			arch: "a".repeat(40),
			uptime: -5,
		});
		expect(identity.hostname).toHaveLength(253);
		expect(identity.os).toHaveLength(128);
		expect(identity.arch).toHaveLength(32);
		expect(identity.uptime_seconds).toBe(0);
	});

	test("falls back to stable values for blank input", () => {
		const identity = collectIdentity({
			hostname: "   ",
			type: "",
			release: "",
			arch: "",
			platform: "linux",
			uptime: 123.9,
		});
		expect(identity.hostname).toBe("unknown");
		expect(identity.os).toBe("linux");
		expect(identity.arch).toBe("unknown");
		expect(identity.uptime_seconds).toBe(123);
	});

	test("falls back to the platform name and rejects a non-finite uptime", () => {
		const identity = collectIdentity({
			hostname: "ws",
			type: "",
			release: "",
			arch: "arm64",
			uptime: Number.NaN,
		});
		expect(identity.os).toBe(process.platform);
		expect(identity.uptime_seconds).toBe(0);
	});

	test("reads the live system identity by default", () => {
		const identity = collectIdentity();
		expect(identity.hostname.length).toBeGreaterThan(0);
		expect(identity.uptime_seconds).toBeGreaterThanOrEqual(0);
	});
});
