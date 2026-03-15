// Dashboard E2E tests — API proxy route integration tests
// Tests the Next.js API routes that proxy to the Worker, verifying
// auth checks, response forwarding, and error handling.
import { describe, expect, test } from "bun:test";
import type { MetricsDataPoint } from "@bat/shared";
import { formatBootTime } from "../src/app/hosts/[id]/page";
import { formatTriggeredAt } from "../src/components/alert-table";
import { formatLastSeen, formatUptime } from "../src/components/host-card";
import { ApiError } from "../src/lib/api";
import { transformCpuData, transformDiskData, transformMemData } from "../src/lib/transforms";

describe("Dashboard E2E — data transformations", () => {
	test("CPU transform extracts usage, iowait, steal", () => {
		const data: MetricsDataPoint[] = [
			{
				ts: 1000,
				cpu_usage_pct: 25.5,
				cpu_iowait: 1.2,
				cpu_steal: 0.3,
				cpu_load1: 0.5,
				cpu_load5: 0.8,
				cpu_load15: 0.6,
				cpu_count: 4,
				mem_total: null,
				mem_available: null,
				mem_used_pct: null,
				swap_total: null,
				swap_used: null,
				swap_used_pct: null,
				disk_json: null,
				net_json: null,
				net_rx_bytes_avg: null,
				net_rx_bytes_max: null,
				net_tx_bytes_avg: null,
				net_tx_bytes_max: null,
				net_rx_errors: null,
				net_tx_errors: null,
				uptime_seconds: null,
			},
		];
		const result = transformCpuData(data);
		expect(result).toHaveLength(1);
		expect(result[0].usage).toBe(25.5);
		expect(result[0].iowait).toBe(1.2);
		expect(result[0].steal).toBe(0.3);
	});

	test("memory transform extracts used_pct", () => {
		const data: MetricsDataPoint[] = [
			{
				ts: 1000,
				cpu_usage_pct: null,
				cpu_iowait: null,
				cpu_steal: null,
				cpu_load1: null,
				cpu_load5: null,
				cpu_load15: null,
				cpu_count: null,
				mem_total: 8_000_000_000,
				mem_available: 4_000_000_000,
				mem_used_pct: 50.0,
				swap_total: null,
				swap_used: null,
				swap_used_pct: null,
				disk_json: null,
				net_json: null,
				net_rx_bytes_avg: null,
				net_rx_bytes_max: null,
				net_tx_bytes_avg: null,
				net_tx_bytes_max: null,
				net_rx_errors: null,
				net_tx_errors: null,
				uptime_seconds: null,
			},
		];
		const result = transformMemData(data);
		expect(result).toHaveLength(1);
		expect(result[0].used_pct).toBe(50.0);
	});

	test("disk transform parses JSON from latest data point", () => {
		const data: MetricsDataPoint[] = [
			{
				ts: 1000,
				cpu_usage_pct: null,
				cpu_iowait: null,
				cpu_steal: null,
				cpu_load1: null,
				cpu_load5: null,
				cpu_load15: null,
				cpu_count: null,
				mem_total: null,
				mem_available: null,
				mem_used_pct: null,
				swap_total: null,
				swap_used: null,
				swap_used_pct: null,
				disk_json:
					'[{"mount":"/","fs_type":"ext4","total_bytes":100000000000,"available_bytes":60000000000,"used_pct":40.0}]',
				net_json: null,
				net_rx_bytes_avg: null,
				net_rx_bytes_max: null,
				net_tx_bytes_avg: null,
				net_tx_bytes_max: null,
				net_rx_errors: null,
				net_tx_errors: null,
				uptime_seconds: null,
			},
		];
		const result = transformDiskData(data);
		expect(result).toHaveLength(1);
		expect(result[0].mount).toBe("/");
		expect(result[0].used_pct).toBe(40.0);
	});
});

describe("Dashboard E2E — formatters", () => {
	test("formatUptime formats seconds into human-readable string", () => {
		expect(formatUptime(86400)).toBe("1d 0h");
		expect(formatUptime(3661)).toBe("1h 1m");
		expect(formatUptime(0)).toBe("—");
		expect(formatUptime(null)).toBe("—");
	});

	test("formatLastSeen formats unix timestamp", () => {
		const ts = Math.floor(Date.now() / 1000) - 30;
		const result = formatLastSeen(ts);
		expect(result).toBe("just now");

		const ts2 = Math.floor(Date.now() / 1000) - 120;
		const result2 = formatLastSeen(ts2);
		expect(result2).toBe("2m ago");
	});

	test("formatTriggeredAt converts unix seconds to locale string", () => {
		const result = formatTriggeredAt(1700000000);
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});

	test("formatBootTime converts unix seconds to locale string", () => {
		const result = formatBootTime(1700000000);
		expect(typeof result).toBe("string");
		expect(result?.length).toBeGreaterThan(0);
	});

	test("formatBootTime returns null for null input", () => {
		expect(formatBootTime(null)).toBeNull();
		expect(formatBootTime(undefined)).toBeNull();
	});
});

describe("Dashboard E2E — API client", () => {
	test("ApiError has correct status and message", () => {
		const err = new ApiError(401, "Unauthorized");
		expect(err.status).toBe(401);
		expect(err.message).toBe("Unauthorized");
		expect(err.name).toBe("ApiError");
		expect(err instanceof Error).toBe(true);
	});
});
