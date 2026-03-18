import { describe, expect, test } from "bun:test";
import type { HostOverviewItem } from "@bat/shared";
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
} from "./host-card";

describe("formatUptime", () => {
	test("returns dash for null", () => {
		expect(formatUptime(null)).toBe("—");
	});

	test("returns dash for zero", () => {
		expect(formatUptime(0)).toBe("—");
	});

	test("returns hours and minutes for short uptime", () => {
		expect(formatUptime(7200)).toBe("2h 0m"); // 2 hours
	});

	test("returns days and hours for long uptime", () => {
		expect(formatUptime(90000)).toBe("1d 1h"); // 1 day 1 hour
	});

	test("handles minutes correctly", () => {
		expect(formatUptime(5400)).toBe("1h 30m"); // 1.5 hours
	});
});

describe("formatLastSeen", () => {
	test("returns just now for recent timestamp", () => {
		const now = Math.floor(Date.now() / 1000);
		expect(formatLastSeen(now - 10)).toBe("just now");
	});

	test("returns minutes ago", () => {
		const now = Math.floor(Date.now() / 1000);
		expect(formatLastSeen(now - 300)).toBe("5m ago");
	});

	test("returns hours ago", () => {
		const now = Math.floor(Date.now() / 1000);
		expect(formatLastSeen(now - 7200)).toBe("2h ago");
	});

	test("returns days ago", () => {
		const now = Math.floor(Date.now() / 1000);
		expect(formatLastSeen(now - 172800)).toBe("2d ago");
	});
});

describe("shortenOs", () => {
	test("truncates PRETTY_NAME to Name Major.Minor", () => {
		expect(shortenOs("Ubuntu 22.04.3 LTS")).toBe("Ubuntu 22.04");
	});

	test("keeps short name unchanged", () => {
		expect(shortenOs("Debian 12")).toBe("Debian 12");
	});

	test("returns null for null input", () => {
		expect(shortenOs(null)).toBeNull();
	});

	test("returns original if no version found", () => {
		expect(shortenOs("Alpine Linux")).toBe("Alpine Linux");
	});
});

describe("formatMemory", () => {
	test("formats GB correctly", () => {
		expect(formatMemory(8589934592)).toBe("8 GB");
	});

	test("formats MB correctly", () => {
		expect(formatMemory(536870912)).toBe("512 MB");
	});

	test("returns null for null", () => {
		expect(formatMemory(null)).toBeNull();
	});

	test("rounds large GB values", () => {
		expect(formatMemory(68719476736)).toBe("64 GB");
	});
});

describe("formatCpuTopology", () => {
	test("shows C/T when physical != logical", () => {
		expect(formatCpuTopology(4, 8)).toBe("4C/8T");
	});

	test("shows C only when equal", () => {
		expect(formatCpuTopology(4, 4)).toBe("4C");
	});

	test("returns null when both null", () => {
		expect(formatCpuTopology(null, null)).toBeNull();
	});

	test("shows logical only when physical null", () => {
		expect(formatCpuTopology(null, 8)).toBe("8C");
	});
});

describe("formatMemoryUsage", () => {
	test("formats GB used/total", () => {
		// 8 GB total, 50% used → "4.0 / 8 GB"
		expect(formatMemoryUsage(8589934592, 50)).toBe("4.0 / 8 GB");
	});

	test("formats MB used/total for small memory", () => {
		// 512 MB total, 25% used → "128 / 512 MB"
		expect(formatMemoryUsage(536870912, 25)).toBe("128 / 512 MB");
	});

	test("returns null when total is null", () => {
		expect(formatMemoryUsage(null, 50)).toBeNull();
	});

	test("returns null when pct is null", () => {
		expect(formatMemoryUsage(8589934592, null)).toBeNull();
	});
});

describe("formatNetRate", () => {
	test("formats bytes per second", () => {
		expect(formatNetRate(500)).toBe("500 B/s");
	});

	test("formats KB/s", () => {
		expect(formatNetRate(1536)).toBe("1.5 KB/s");
	});

	test("formats MB/s", () => {
		expect(formatNetRate(10485760)).toBe("10.0 MB/s");
	});

	test("formats GB/s", () => {
		expect(formatNetRate(1073741824)).toBe("1.0 GB/s");
	});

	test("returns dash for null", () => {
		expect(formatNetRate(null)).toBe("—");
	});
});

describe("formatDiskUsage", () => {
	test("formats percentage", () => {
		expect(formatDiskUsage(42.7)).toBe("43%");
	});

	test("returns dash for null", () => {
		expect(formatDiskUsage(null)).toBe("—");
	});

	test("formats zero", () => {
		expect(formatDiskUsage(0)).toBe("0%");
	});
});

describe("getBarColor", () => {
	test("returns success for low values", () => {
		expect(getBarColor(0)).toBe("bg-success");
		expect(getBarColor(59)).toBe("bg-success");
	});

	test("returns warning for medium values", () => {
		expect(getBarColor(60)).toBe("bg-warning");
		expect(getBarColor(79)).toBe("bg-warning");
	});

	test("returns destructive for high values", () => {
		expect(getBarColor(80)).toBe("bg-destructive");
		expect(getBarColor(100)).toBe("bg-destructive");
	});
});

describe("getValueColor", () => {
	test("returns success for low values", () => {
		expect(getValueColor(0)).toBe("text-success");
		expect(getValueColor(59)).toBe("text-success");
	});

	test("returns warning for medium values", () => {
		expect(getValueColor(60)).toBe("text-warning");
		expect(getValueColor(79)).toBe("text-warning");
	});

	test("returns destructive for high values", () => {
		expect(getValueColor(80)).toBe("text-destructive");
		expect(getValueColor(100)).toBe("text-destructive");
	});
});

const baseHost: HostOverviewItem = {
	hid: "abc12345",
	host_id: "host-001",
	hostname: "server-1",
	os: "Ubuntu 22.04.3 LTS",
	kernel: "6.8.0",
	arch: "x86_64",
	cpu_model: "AMD EPYC",
	boot_time: null,
	status: "healthy",
	cpu_usage_pct: 42.5,
	mem_used_pct: 67.0,
	uptime_seconds: null,
	last_seen: 0,
	alert_count: 0,
	cpu_logical: 8,
	cpu_physical: 4,
	mem_total_bytes: 8589934592,
	virtualization: "kvm",
	public_ip: "203.0.113.42",
	probe_version: "0.5.2",
	cpu_load1: 0.5,
	swap_used_pct: 5.0,
	disk_root_used_pct: 40.0,
	net_rx_rate: 1000000,
	net_tx_rate: 500000,
	cpu_sparkline: [
		{ ts: 1000, v: 10 },
		{ ts: 2000, v: 30 },
		{ ts: 3000, v: 50 },
	],
	mem_sparkline: [
		{ ts: 1000, v: 60 },
		{ ts: 2000, v: 65 },
		{ ts: 3000, v: 70 },
	],
};

describe("buildSubtitle", () => {
	test("builds full subtitle with OS, arch, virt, IP", () => {
		expect(buildSubtitle(baseHost)).toBe("Ubuntu 22.04 · x86_64 · KVM · 203.0.113.42");
	});

	test("returns null when all fields null", () => {
		const emptyHost = {
			...baseHost,
			os: null,
			arch: null,
			cpu_logical: null,
			cpu_physical: null,
			mem_total_bytes: null,
			virtualization: null,
			public_ip: null,
		};
		expect(buildSubtitle(emptyHost)).toBeNull();
	});

	test("partial fields produce partial subtitle", () => {
		const partial = {
			...baseHost,
			arch: null,
			virtualization: null,
			public_ip: null,
		};
		expect(buildSubtitle(partial)).toBe("Ubuntu 22.04");
	});

	test("includes virtualization uppercased", () => {
		const withVirt = { ...baseHost, arch: null, public_ip: null };
		expect(buildSubtitle(withVirt)).toBe("Ubuntu 22.04 · KVM");
	});
});
