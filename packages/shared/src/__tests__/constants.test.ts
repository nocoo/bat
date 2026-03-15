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
