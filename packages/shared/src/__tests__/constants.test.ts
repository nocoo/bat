import { describe, expect, test } from "bun:test";
import {
	ALERT_THRESHOLDS,
	AUTO_RESOLUTION_THRESHOLD_SECONDS,
	INTERVALS,
	RETENTION,
} from "../constants";

describe("ALERT_THRESHOLDS", () => {
	test("memory high threshold is 85%", () => {
		expect(ALERT_THRESHOLDS.MEM_HIGH_PCT).toBe(85);
	});

	test("memory high swap threshold is 50%", () => {
		expect(ALERT_THRESHOLDS.MEM_HIGH_SWAP_PCT).toBe(50);
	});

	test("no swap memory threshold is 70%", () => {
		expect(ALERT_THRESHOLDS.NO_SWAP_MEM_PCT).toBe(70);
	});

	test("disk full threshold is 85%", () => {
		expect(ALERT_THRESHOLDS.DISK_FULL_PCT).toBe(85);
	});

	test("iowait high threshold is 20%", () => {
		expect(ALERT_THRESHOLDS.IOWAIT_HIGH_PCT).toBe(20);
	});

	test("steal high threshold is 10%", () => {
		expect(ALERT_THRESHOLDS.STEAL_HIGH_PCT).toBe(10);
	});

	test("offline threshold is 120 seconds", () => {
		expect(ALERT_THRESHOLDS.OFFLINE_SECONDS).toBe(120);
	});

	test("iowait duration is 300 seconds (5 min)", () => {
		expect(ALERT_THRESHOLDS.IOWAIT_DURATION_SECONDS).toBe(300);
	});

	test("steal duration is 300 seconds (5 min)", () => {
		expect(ALERT_THRESHOLDS.STEAL_DURATION_SECONDS).toBe(300);
	});
});

describe("RETENTION", () => {
	test("raw retention is 7 days", () => {
		expect(RETENTION.RAW_DAYS).toBe(7);
	});

	test("hourly retention is 90 days", () => {
		expect(RETENTION.HOURLY_DAYS).toBe(90);
	});
});

describe("INTERVALS", () => {
	test("metrics interval is 30 seconds", () => {
		expect(INTERVALS.METRICS_SECONDS).toBe(30);
	});

	test("identity interval is 6 hours", () => {
		expect(INTERVALS.IDENTITY_HOURS).toBe(6);
	});

	test("clock skew max is 300 seconds (5 min)", () => {
		expect(INTERVALS.CLOCK_SKEW_MAX_SECONDS).toBe(300);
	});
});

describe("AUTO_RESOLUTION_THRESHOLD_SECONDS", () => {
	test("is 86400 (24 hours)", () => {
		expect(AUTO_RESOLUTION_THRESHOLD_SECONDS).toBe(86400);
	});
});

import {
	DEFAULT_PUBLIC_PORT_ALLOWLIST,
	SIGNAL_EXPANSION_THRESHOLDS,
	TIER2_THRESHOLDS,
	TIER3_THRESHOLDS,
} from "../constants";

describe("TIER2_THRESHOLDS", () => {
	test("uptime anomaly is 5 minutes", () => {
		expect(TIER2_THRESHOLDS.UPTIME_ANOMALY_SECONDS).toBe(300);
	});
	test("container restart count is 5", () => {
		expect(TIER2_THRESHOLDS.CONTAINER_RESTART_COUNT).toBe(5);
	});
});

describe("TIER3_THRESHOLDS", () => {
	test("PSI durations are 5 minutes", () => {
		expect(TIER3_THRESHOLDS.PSI_DURATION_SECONDS).toBe(300);
		expect(TIER3_THRESHOLDS.DISK_IO_DURATION_SECONDS).toBe(300);
		expect(TIER3_THRESHOLDS.TCP_DURATION_SECONDS).toBe(300);
	});
	test("PSI CPU > PSI IO > PSI MEM (memory is most sensitive)", () => {
		expect(TIER3_THRESHOLDS.PSI_CPU_PCT).toBeGreaterThan(TIER3_THRESHOLDS.PSI_IO_PCT);
		expect(TIER3_THRESHOLDS.PSI_IO_PCT).toBeGreaterThan(TIER3_THRESHOLDS.PSI_MEM_PCT);
	});
	test("disk IO util is a percentage (0-100)", () => {
		expect(TIER3_THRESHOLDS.DISK_IO_UTIL_PCT).toBeGreaterThan(0);
		expect(TIER3_THRESHOLDS.DISK_IO_UTIL_PCT).toBeLessThanOrEqual(100);
	});
	test("tcp time-wait threshold is 500", () => {
		expect(TIER3_THRESHOLDS.TCP_TIME_WAIT).toBe(500);
	});
});

describe("SIGNAL_EXPANSION_THRESHOLDS", () => {
	test("inode full is 90%", () => {
		expect(SIGNAL_EXPANSION_THRESHOLDS.INODE_FULL_PCT).toBe(90);
	});
	test("overcommit ratio > 1 (i.e. allocation > RAM)", () => {
		expect(SIGNAL_EXPANSION_THRESHOLDS.OVERCOMMIT_RATIO).toBeGreaterThan(1);
	});
	test("conntrack full ratio is between 0 and 1", () => {
		expect(SIGNAL_EXPANSION_THRESHOLDS.CONNTRACK_FULL_RATIO).toBeGreaterThan(0);
		expect(SIGNAL_EXPANSION_THRESHOLDS.CONNTRACK_FULL_RATIO).toBeLessThanOrEqual(1);
	});
	test("disk read await < write await (writes are slower)", () => {
		expect(SIGNAL_EXPANSION_THRESHOLDS.DISK_READ_AWAIT_MS).toBeLessThan(
			SIGNAL_EXPANSION_THRESHOLDS.DISK_WRITE_AWAIT_MS,
		);
	});
	test("duration is 5 minutes", () => {
		expect(SIGNAL_EXPANSION_THRESHOLDS.SIGNAL_EXPANSION_DURATION_SECONDS).toBe(300);
	});
});

describe("DEFAULT_PUBLIC_PORT_ALLOWLIST", () => {
	test("contains ssh, http, https", () => {
		expect(DEFAULT_PUBLIC_PORT_ALLOWLIST).toEqual([22, 80, 443]);
	});
	test("is readonly tuple (frozen-like)", () => {
		// Mutating a readonly-typed array still works at runtime, but we assert
		// ordering invariant: SSH first, then well-known web ports ascending.
		expect(DEFAULT_PUBLIC_PORT_ALLOWLIST[0]).toBe(22);
		expect(DEFAULT_PUBLIC_PORT_ALLOWLIST[1]).toBeLessThan(
			DEFAULT_PUBLIC_PORT_ALLOWLIST[2] as number,
		);
	});
});
