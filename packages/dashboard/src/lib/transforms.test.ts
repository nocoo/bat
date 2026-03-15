import { describe, expect, test } from "bun:test";
import type { MetricsDataPoint } from "@bat/shared";
import {
	formatBytes,
	formatBytesRate,
	formatDateTime,
	formatTime,
	transformCpuData,
	transformDiskData,
	transformMemData,
	transformNetData,
} from "./transforms";

function makePoint(overrides: Partial<MetricsDataPoint> = {}): MetricsDataPoint {
	return {
		ts: 1700000000,
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
		disk_json: null,
		net_json: null,
		net_rx_bytes_avg: null,
		net_rx_bytes_max: null,
		net_tx_bytes_avg: null,
		net_tx_bytes_max: null,
		net_rx_errors: null,
		net_tx_errors: null,
		uptime_seconds: null,
		...overrides,
	};
}

describe("transformCpuData", () => {
	test("extracts cpu fields", () => {
		const result = transformCpuData([
			makePoint({ ts: 100, cpu_usage_pct: 45.2, cpu_iowait: 3.1, cpu_steal: 0.5 }),
		]);
		expect(result).toEqual([{ ts: 100, usage: 45.2, iowait: 3.1, steal: 0.5 }]);
	});

	test("null fields default to 0", () => {
		const result = transformCpuData([makePoint({ ts: 200 })]);
		expect(result).toEqual([{ ts: 200, usage: 0, iowait: 0, steal: 0 }]);
	});

	test("empty array returns empty", () => {
		expect(transformCpuData([])).toEqual([]);
	});
});

describe("transformMemData", () => {
	test("extracts memory used percent", () => {
		const result = transformMemData([makePoint({ ts: 100, mem_used_pct: 72.5 })]);
		expect(result).toEqual([{ ts: 100, used_pct: 72.5 }]);
	});

	test("null defaults to 0", () => {
		const result = transformMemData([makePoint({ ts: 100 })]);
		expect(result).toEqual([{ ts: 100, used_pct: 0 }]);
	});
});

describe("transformNetData", () => {
	test("hourly uses scalar fields", () => {
		const result = transformNetData(
			[makePoint({ ts: 100, net_rx_bytes_avg: 5000, net_tx_bytes_avg: 2000 })],
			"hourly",
		);
		expect(result).toEqual([{ ts: 100, rx_rate: 5000, tx_rate: 2000 }]);
	});

	test("raw parses net_json and aggregates", () => {
		const netJson = JSON.stringify([
			{ iface: "eth0", rx_bytes_rate: 3000, tx_bytes_rate: 1000 },
			{ iface: "eth1", rx_bytes_rate: 2000, tx_bytes_rate: 500 },
		]);
		const result = transformNetData([makePoint({ ts: 100, net_json: netJson })], "raw");
		expect(result).toEqual([{ ts: 100, rx_rate: 5000, tx_rate: 1500 }]);
	});

	test("raw with null net_json returns zeros", () => {
		const result = transformNetData([makePoint({ ts: 100 })], "raw");
		expect(result).toEqual([{ ts: 100, rx_rate: 0, tx_rate: 0 }]);
	});

	test("raw with invalid net_json returns zeros", () => {
		const result = transformNetData([makePoint({ ts: 100, net_json: "invalid json" })], "raw");
		expect(result).toEqual([{ ts: 100, rx_rate: 0, tx_rate: 0 }]);
	});
});

describe("transformDiskData", () => {
	test("parses disk_json from latest point", () => {
		const diskJson = JSON.stringify([
			{ mount: "/", used_pct: 45.2, total_bytes: 1000000, avail_bytes: 548000 },
			{ mount: "/data", used_pct: 80.1, total_bytes: 2000000, avail_bytes: 398000 },
		]);
		const result = transformDiskData([
			makePoint({ ts: 100, disk_json: "[]" }),
			makePoint({ ts: 200, disk_json: diskJson }),
		]);
		expect(result).toHaveLength(2);
		expect(result[0]?.mount).toBe("/");
		expect(result[0]?.used_pct).toBe(45.2);
		expect(result[1]?.mount).toBe("/data");
	});

	test("returns empty for empty data", () => {
		expect(transformDiskData([])).toEqual([]);
	});

	test("returns empty for null disk_json", () => {
		expect(transformDiskData([makePoint()])).toEqual([]);
	});

	test("returns empty for invalid disk_json", () => {
		expect(transformDiskData([makePoint({ disk_json: "bad" })])).toEqual([]);
	});
});

describe("formatTime", () => {
	test("formats timestamp to HH:MM", () => {
		// Create a known timestamp
		const d = new Date(2024, 0, 15, 14, 30);
		const ts = Math.floor(d.getTime() / 1000);
		expect(formatTime(ts)).toBe("14:30");
	});
});

describe("formatDateTime", () => {
	test("formats timestamp to MM/DD HH:MM", () => {
		const d = new Date(2024, 0, 15, 14, 30);
		const ts = Math.floor(d.getTime() / 1000);
		expect(formatDateTime(ts)).toBe("01/15 14:30");
	});
});

describe("formatBytesRate", () => {
	test("formats bytes per second", () => {
		expect(formatBytesRate(500)).toBe("500 B/s");
		expect(formatBytesRate(1536)).toBe("1.5 KB/s");
		expect(formatBytesRate(1048576)).toBe("1.0 MB/s");
		expect(formatBytesRate(1073741824)).toBe("1.0 GB/s");
	});
});

describe("formatBytes", () => {
	test("formats bytes", () => {
		expect(formatBytes(500)).toBe("500 B");
		expect(formatBytes(1536)).toBe("1.5 KB");
		expect(formatBytes(1048576)).toBe("1.0 MB");
		expect(formatBytes(1073741824)).toBe("1.0 GB");
		expect(formatBytes(1099511627776)).toBe("1.0 TB");
	});
});
