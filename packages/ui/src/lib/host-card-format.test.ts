import { describe, expect, test } from "vitest";
import type { HostOverviewItem, SparklinePoint } from "@bat/shared";
import {
	buildSubtitle,
	formatCpuTopology,
	formatDiskUsage,
	formatLastSeen,
	formatMemory,
	formatMemoryUsage,
	formatNetRate,
	formatUptime,
	getBarColor,
	getValueColor,
	shortenOs,
	statusDotColor,
	toPolyline,
} from "./host-card-format";

describe("formatUptime", () => {
	test.each([
		[null, "—"],
		[0, "—"],
		[-1, "—"],
		[60, "0h 1m"],
		[3661, "1h 1m"],
		[86400, "1d 0h"],
		[90061, "1d 1h"],
		[2 * 86400 + 5 * 3600, "2d 5h"],
	])("formatUptime(%p) === %p", (input, expected) => {
		expect(formatUptime(input)).toBe(expected);
	});
});

describe("formatLastSeen", () => {
	const now = 1_700_000_000;
	test.each([
		[now, "just now"],
		[now - 30, "just now"],
		[now - 120, "2m ago"],
		[now - 3 * 3600, "3h ago"],
		[now - 2 * 86400, "2d ago"],
	])("formatLastSeen(now-Δ) gives expected", (ts, expected) => {
		expect(formatLastSeen(ts, now)).toBe(expected);
	});

	test("falls back to wall clock when nowSeconds omitted", () => {
		const wall = Math.floor(Date.now() / 1000);
		expect(formatLastSeen(wall - 5)).toBe("just now");
	});
});

describe("shortenOs", () => {
	test("trims patch/edition", () => {
		expect(shortenOs("Ubuntu 22.04.3 LTS")).toBe("Ubuntu 22.04");
	});
	test("returns the input when pattern doesn't match", () => {
		expect(shortenOs("Arch Linux")).toBe("Arch Linux");
	});
	test("returns null for null", () => {
		expect(shortenOs(null)).toBeNull();
	});
});

describe("formatMemory", () => {
	test("≥ 1 GB → GB rounded", () => {
		expect(formatMemory(8 * 1024 ** 3)).toBe("8 GB");
	});
	test("< 1 GB → MB rounded", () => {
		expect(formatMemory(512 * 1024 * 1024)).toBe("512 MB");
	});
	test("null → null", () => {
		expect(formatMemory(null)).toBeNull();
	});
});

describe("formatCpuTopology", () => {
	test.each([
		[4, 8, "4C/8T"],
		[4, 4, "4C"],
		[null, 4, "4C"],
		[4, null, "4C"],
		[null, null, null],
	])("formatCpuTopology(%p, %p) === %p", (p, l, expected) => {
		expect(formatCpuTopology(p, l)).toBe(expected as string | null);
	});
});

describe("formatMemoryUsage", () => {
	test("GB scale", () => {
		expect(formatMemoryUsage(8 * 1024 ** 3, 60)).toBe("4.8 / 8 GB");
	});
	test("MB scale", () => {
		expect(formatMemoryUsage(512 * 1024 * 1024, 50)).toBe("256 / 512 MB");
	});
	test("null when missing input", () => {
		expect(formatMemoryUsage(null, 50)).toBeNull();
		expect(formatMemoryUsage(8 * 1024 ** 3, null)).toBeNull();
	});
});

describe("formatNetRate", () => {
	test.each([
		[null, "—"],
		[0, "0 B/s"],
		[500, "500 B/s"],
		[2048, "2.0 KB/s"],
		[5 * 1024 * 1024, "5.0 MB/s"],
		[2 * 1024 ** 3, "2.0 GB/s"],
	])("formatNetRate(%p) === %p", (input, expected) => {
		expect(formatNetRate(input)).toBe(expected);
	});
});

describe("formatDiskUsage", () => {
	test("rounds to integer percent or returns —", () => {
		expect(formatDiskUsage(null)).toBe("—");
		expect(formatDiskUsage(47.6)).toBe("48%");
	});
});

describe("buildSubtitle", () => {
	const base = (h: Partial<HostOverviewItem>): HostOverviewItem => h as HostOverviewItem;

	test("joins os/arch/virt/ip with separator and uppercases virt", () => {
		expect(
			buildSubtitle(
				base({
					os: "Ubuntu 22.04.3 LTS",
					arch: "x86_64",
					virtualization: "kvm",
					public_ip: "1.2.3.4",
				}),
			),
		).toBe("Ubuntu 22.04 · x86_64 · KVM · 1.2.3.4");
	});

	test("returns null when no parts", () => {
		expect(
			buildSubtitle(base({ os: null, arch: null, virtualization: null, public_ip: null })),
		).toBeNull();
	});
});

describe("getBarColor / getValueColor / statusDotColor", () => {
	test("bar color thresholds", () => {
		expect(getBarColor(20)).toBe("bg-success");
		expect(getBarColor(60)).toBe("bg-warning");
		expect(getBarColor(80)).toBe("bg-destructive");
	});
	test("value color thresholds", () => {
		expect(getValueColor(20)).toBe("text-success");
		expect(getValueColor(60)).toBe("text-warning");
		expect(getValueColor(95)).toBe("text-destructive");
	});
	test("status dot color mapping", () => {
		expect(statusDotColor("healthy")).toBe("bg-success");
		expect(statusDotColor("warning")).toBe("bg-warning");
		expect(statusDotColor("critical")).toBe("bg-destructive");
		expect(statusDotColor("unknown")).toBe("bg-muted-foreground");
		expect(statusDotColor("offline")).toBe("bg-muted-foreground");
	});
});

describe("toPolyline", () => {
	const pt = (v: number): SparklinePoint => ({ v }) as SparklinePoint;

	test("returns '' for empty data", () => {
		expect(toPolyline([], 10, 20)).toBe("");
	});

	test("centers single-slot points at x=50", () => {
		expect(toPolyline([pt(100)], 1, 20)).toBe("50,0");
	});

	test("spreads points evenly across [0,100] with inverted y", () => {
		// height=10, totalSlots=3, values [0,50,100]
		// x = i/2 * 100 = [0, 50, 100]
		// y = 10 - v/100*10 = [10, 5, 0]
		expect(toPolyline([pt(0), pt(50), pt(100)], 3, 10)).toBe("0,10 50,5 100,0");
	});
});
