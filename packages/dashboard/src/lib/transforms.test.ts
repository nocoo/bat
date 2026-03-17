import { describe, expect, test } from "bun:test";
import type { MetricsDataPoint } from "@bat/shared";
import {
	formatBytes,
	formatBytesRate,
	formatDateTime,
	formatTime,
	getTimeFormatter,
	transformCpuData,
	transformDiskData,
	transformDiskIoData,
	transformMemData,
	transformNetData,
	transformPsiData,
	transformTcpData,
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
		// Tier 3 fields
		psi_cpu_some_avg10: null,
		psi_cpu_some_avg60: null,
		psi_cpu_some_avg300: null,
		psi_mem_some_avg10: null,
		psi_mem_some_avg60: null,
		psi_mem_some_avg300: null,
		psi_mem_full_avg10: null,
		psi_mem_full_avg60: null,
		psi_mem_full_avg300: null,
		psi_io_some_avg10: null,
		psi_io_some_avg60: null,
		psi_io_some_avg300: null,
		psi_io_full_avg10: null,
		psi_io_full_avg60: null,
		psi_io_full_avg300: null,
		disk_io_json: null,
		tcp_established: null,
		tcp_time_wait: null,
		tcp_orphan: null,
		tcp_allocated: null,
		context_switches_sec: null,
		forks_sec: null,
		procs_running: null,
		procs_blocked: null,
		oom_kills: null,
		fd_allocated: null,
		fd_max: null,
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

describe("getTimeFormatter", () => {
	test("returns formatTime for ranges under 7 days", () => {
		expect(getTimeFormatter(3600)).toBe(formatTime); // 1h
		expect(getTimeFormatter(86400)).toBe(formatTime); // 24h
	});

	test("returns formatDateTime for ranges >= 7 days", () => {
		expect(getTimeFormatter(604800)).toBe(formatDateTime); // 7d
		expect(getTimeFormatter(2592000)).toBe(formatDateTime); // 30d
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

// --- Tier 3 transforms ---

describe("transformPsiData", () => {
	test("extracts PSI avg60 fields", () => {
		const result = transformPsiData([
			makePoint({
				ts: 100,
				psi_cpu_some_avg60: 5.2,
				psi_mem_some_avg60: 1.3,
				psi_io_some_avg60: 0.5,
			}),
		]);
		expect(result).toEqual([{ ts: 100, cpu: 5.2, memory: 1.3, io: 0.5 }]);
	});

	test("returns empty when no PSI data present", () => {
		expect(transformPsiData([makePoint()])).toEqual([]);
	});

	test("null fields default to 0", () => {
		const result = transformPsiData([makePoint({ ts: 100, psi_cpu_some_avg60: 3.0 })]);
		expect(result).toEqual([{ ts: 100, cpu: 3.0, memory: 0, io: 0 }]);
	});
});

describe("transformDiskIoData", () => {
	test("parses raw disk_io_json and aggregates", () => {
		const diskIoJson = JSON.stringify([
			{
				device: "sda",
				read_iops: 10,
				write_iops: 20,
				read_bytes_sec: 1024,
				write_bytes_sec: 2048,
				io_util_pct: 30,
			},
			{
				device: "sdb",
				read_iops: 5,
				write_iops: 15,
				read_bytes_sec: 512,
				write_bytes_sec: 1024,
				io_util_pct: 50,
			},
		]);
		const result = transformDiskIoData([makePoint({ ts: 100, disk_io_json: diskIoJson })], "raw");
		expect(result).toEqual([{ ts: 100, read_iops: 15, write_iops: 35, io_util_pct: 50 }]);
	});

	test("parses hourly disk_io_json with aggregated field names", () => {
		const diskIoJson = JSON.stringify([
			{
				device: "sda",
				read_iops_avg: 100,
				write_iops_avg: 200,
				read_bytes_sec_avg: 50000,
				write_bytes_sec_avg: 80000,
				io_util_pct_avg: 25.5,
				io_util_pct_max: 40,
			},
			{
				device: "sdb",
				read_iops_avg: 50,
				write_iops_avg: 75,
				read_bytes_sec_avg: 10000,
				write_bytes_sec_avg: 20000,
				io_util_pct_avg: 10.0,
				io_util_pct_max: 15,
			},
		]);
		const result = transformDiskIoData(
			[makePoint({ ts: 100, disk_io_json: diskIoJson })],
			"hourly",
		);
		expect(result).toEqual([{ ts: 100, read_iops: 150, write_iops: 275, io_util_pct: 25.5 }]);
	});

	test("defaults to raw resolution", () => {
		const diskIoJson = JSON.stringify([
			{
				device: "sda",
				read_iops: 10,
				write_iops: 20,
				read_bytes_sec: 1024,
				write_bytes_sec: 2048,
				io_util_pct: 30,
			},
		]);
		const result = transformDiskIoData([makePoint({ ts: 100, disk_io_json: diskIoJson })]);
		expect(result).toEqual([{ ts: 100, read_iops: 10, write_iops: 20, io_util_pct: 30 }]);
	});

	test("returns empty when no disk_io data", () => {
		expect(transformDiskIoData([makePoint()])).toEqual([]);
	});

	test("handles invalid JSON gracefully", () => {
		const result = transformDiskIoData([makePoint({ ts: 100, disk_io_json: "bad" })]);
		expect(result).toEqual([{ ts: 100, read_iops: 0, write_iops: 0, io_util_pct: 0 }]);
	});
});

describe("transformTcpData", () => {
	test("extracts TCP connection state fields", () => {
		const result = transformTcpData([
			makePoint({ ts: 100, tcp_established: 42, tcp_time_wait: 10, tcp_orphan: 2 }),
		]);
		expect(result).toEqual([{ ts: 100, established: 42, time_wait: 10, orphan: 2 }]);
	});

	test("returns empty when no TCP data", () => {
		expect(transformTcpData([makePoint()])).toEqual([]);
	});

	test("null fields default to 0", () => {
		const result = transformTcpData([makePoint({ ts: 100, tcp_established: 5 })]);
		expect(result).toEqual([{ ts: 100, established: 5, time_wait: 0, orphan: 0 }]);
	});
});
