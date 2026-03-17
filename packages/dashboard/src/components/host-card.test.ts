import { describe, expect, test } from "bun:test";
import type { HostOverviewItem } from "@bat/shared";
import {
	buildSubtitle,
	formatCpuTopology,
	formatLastSeen,
	formatMemory,
	formatUptime,
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

describe("buildSubtitle", () => {
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
		cpu_usage_pct: null,
		mem_used_pct: null,
		uptime_seconds: null,
		last_seen: 0,
		alert_count: 0,
		cpu_logical: 8,
		cpu_physical: 4,
		mem_total_bytes: 8589934592,
		virtualization: "kvm",
	};

	test("builds full subtitle", () => {
		expect(buildSubtitle(baseHost)).toBe("Ubuntu 22.04 · x86_64 · 4C/8T · 8 GB");
	});

	test("returns null when all fields null", () => {
		const emptyHost = {
			...baseHost,
			os: null,
			arch: null,
			cpu_logical: null,
			cpu_physical: null,
			mem_total_bytes: null,
		};
		expect(buildSubtitle(emptyHost)).toBeNull();
	});

	test("partial fields produce partial subtitle", () => {
		const partial = { ...baseHost, arch: null, cpu_logical: null, cpu_physical: null };
		expect(buildSubtitle(partial)).toBe("Ubuntu 22.04 · 8 GB");
	});
});
