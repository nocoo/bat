import { describe, expect, test } from "bun:test";
import type { MetricsDataPoint } from "@bat/shared";
import {
	formatBytes,
	formatBytesRate,
	formatDateTime,
	formatTime,
	formatUptime,
	getTimeFormatter,
	transformCpuData,
	transformDiskData,
	transformDiskIoData,
	transformMemData,
	transformNetData,
	transformPsiData,
	transformTcpData,
	transformTopProcessesData,
} from "./transforms";

const dp = (overrides: Partial<MetricsDataPoint>): MetricsDataPoint =>
	({ ts: 1, ...overrides }) as MetricsDataPoint;

describe("transformCpuData", () => {
	test("maps fields and defaults nullish to 0", () => {
		const out = transformCpuData([
			dp({ ts: 10, cpu_usage_pct: 12.5, cpu_iowait: 1, cpu_steal: 0.2 }),
			dp({ ts: 20 }),
		]);
		expect(out).toEqual([
			{ ts: 10, usage: 12.5, iowait: 1, steal: 0.2 },
			{ ts: 20, usage: 0, iowait: 0, steal: 0 },
		]);
	});
});

describe("transformMemData", () => {
	test("maps mem_used_pct, defaults to 0", () => {
		expect(transformMemData([dp({ ts: 5, mem_used_pct: 42 }), dp({ ts: 6 })])).toEqual([
			{ ts: 5, used_pct: 42 },
			{ ts: 6, used_pct: 0 },
		]);
	});
});

describe("transformNetData", () => {
	test("hourly mode uses scalar averages", () => {
		const out = transformNetData(
			[dp({ ts: 1, net_rx_bytes_avg: 100, net_tx_bytes_avg: 50 }), dp({ ts: 2 })],
			"hourly",
		);
		expect(out).toEqual([
			{ ts: 1, rx_rate: 100, tx_rate: 50 },
			{ ts: 2, rx_rate: 0, tx_rate: 0 },
		]);
	});

	test("raw mode aggregates JSON entries across interfaces", () => {
		const json = JSON.stringify([
			{ iface: "eth0", rx_bytes_rate: 100, tx_bytes_rate: 50 },
			{ iface: "eth1", rx_bytes_rate: 25, tx_bytes_rate: 5 },
		]);
		expect(transformNetData([dp({ ts: 1, net_json: json })], "raw")).toEqual([
			{ ts: 1, rx_rate: 125, tx_rate: 55 },
		]);
	});

	test("raw mode returns zeros on invalid JSON or missing field", () => {
		expect(transformNetData([dp({ ts: 1, net_json: "garbage" }), dp({ ts: 2 })], "raw")).toEqual([
			{ ts: 1, rx_rate: 0, tx_rate: 0 },
			{ ts: 2, rx_rate: 0, tx_rate: 0 },
		]);
	});
});

describe("transformDiskData", () => {
	test("uses last data point's disk_json", () => {
		const json = JSON.stringify([
			{ mount: "/", used_pct: 80, total_bytes: 1000, avail_bytes: 200 },
		]);
		expect(transformDiskData([dp({ ts: 1 }), dp({ ts: 2, disk_json: json })])).toEqual([
			{ mount: "/", used_pct: 80, total_bytes: 1000, avail_bytes: 200 },
		]);
	});

	test("returns [] on empty input or missing/invalid disk_json", () => {
		expect(transformDiskData([])).toEqual([]);
		expect(transformDiskData([dp({ ts: 1 })])).toEqual([]);
		expect(transformDiskData([dp({ ts: 1, disk_json: "{" })])).toEqual([]);
	});
});

describe("formatTime / formatDateTime / getTimeFormatter", () => {
	const ts = Math.floor(new Date(2025, 5, 7, 9, 5).getTime() / 1000);

	test("formatTime is HH:MM zero-padded", () => {
		expect(formatTime(ts)).toBe("09:05");
	});

	test("formatDateTime is MM/DD HH:MM zero-padded", () => {
		expect(formatDateTime(ts)).toBe("06/07 09:05");
	});

	test("getTimeFormatter switches at >= 7 days", () => {
		expect(getTimeFormatter(86400).name).toBe("formatTime");
		expect(getTimeFormatter(604_800).name).toBe("formatDateTime");
	});
});

describe("formatBytesRate", () => {
	test("scales B/s → KB/s → MB/s → GB/s", () => {
		expect(formatBytesRate(500)).toBe("500 B/s");
		expect(formatBytesRate(2048)).toBe("2.0 KB/s");
		expect(formatBytesRate(5 * 1024 * 1024)).toBe("5.0 MB/s");
		expect(formatBytesRate(3 * 1024 * 1024 * 1024)).toBe("3.0 GB/s");
	});
});

describe("formatBytes", () => {
	test("scales B → KB → MB → GB → TB", () => {
		expect(formatBytes(0)).toBe("0 B");
		expect(formatBytes(2048)).toBe("2.0 KB");
		expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
		expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");
		expect(formatBytes(3 * 1024 ** 4)).toBe("3.0 TB");
	});
});

describe("transformPsiData", () => {
	test("returns [] when no PSI present", () => {
		expect(transformPsiData([dp({ ts: 1 })])).toEqual([]);
	});

	test("maps avg60 with nullish → 0", () => {
		expect(
			transformPsiData([
				dp({ ts: 1, psi_cpu_some_avg60: 1.5, psi_mem_some_avg60: 0.5 }),
				dp({ ts: 2, psi_cpu_some_avg60: 0 }),
			]),
		).toEqual([
			{ ts: 1, cpu: 1.5, memory: 0.5, io: 0 },
			{ ts: 2, cpu: 0, memory: 0, io: 0 },
		]);
	});
});

describe("transformDiskIoData", () => {
	test("returns [] when no disk_io_json present", () => {
		expect(transformDiskIoData([dp({ ts: 1 })], "raw")).toEqual([]);
	});

	test("raw mode sums IOPS and takes max io_util", () => {
		const json = JSON.stringify([
			{ device: "sda", read_iops: 10, write_iops: 5, io_util_pct: 60 },
			{ device: "sdb", read_iops: 1, write_iops: 2, io_util_pct: 30 },
		]);
		expect(transformDiskIoData([dp({ ts: 1, disk_io_json: json })], "raw")).toEqual([
			{ ts: 1, read_iops: 11, write_iops: 7, io_util_pct: 60 },
		]);
	});

	test("hourly mode uses *_avg fields", () => {
		const json = JSON.stringify([
			{ device: "sda", read_iops_avg: 4, write_iops_avg: 6, io_util_pct_avg: 20 },
		]);
		expect(transformDiskIoData([dp({ ts: 1, disk_io_json: json })], "hourly")).toEqual([
			{ ts: 1, read_iops: 4, write_iops: 6, io_util_pct: 20 },
		]);
	});

	test("invalid JSON yields zeroed point", () => {
		expect(transformDiskIoData([dp({ ts: 1, disk_io_json: "x" })], "raw")).toEqual([
			{ ts: 1, read_iops: 0, write_iops: 0, io_util_pct: 0 },
		]);
	});
});

describe("transformTcpData", () => {
	test("returns [] without TCP fields", () => {
		expect(transformTcpData([dp({ ts: 1 })])).toEqual([]);
	});

	test("maps tcp_* fields", () => {
		expect(
			transformTcpData([dp({ ts: 1, tcp_established: 100, tcp_time_wait: 5, tcp_orphan: 0 })]),
		).toEqual([{ ts: 1, established: 100, time_wait: 5, orphan: 0 }]);
	});
});

describe("transformTopProcessesData", () => {
	test("returns [] when no point has top_processes_json", () => {
		expect(transformTopProcessesData([dp({ ts: 1 })])).toEqual([]);
	});

	test("uses last point that has top_processes_json", () => {
		const json = JSON.stringify([
			{ pid: 1, name: "init", cpu_pct: 0.5, mem_rss: 100, mem_pct: 1 },
		]);
		const out = transformTopProcessesData([dp({ ts: 1, top_processes_json: json }), dp({ ts: 2 })]);
		expect(out).toHaveLength(1);
		expect(out[0]?.pid).toBe(1);
		expect(out[0]?.cpu_pct).toBe(0.5);
		expect(out[0]?.processor).toBe(-1);
	});

	test("invalid JSON returns []", () => {
		expect(transformTopProcessesData([dp({ ts: 1, top_processes_json: "}" })])).toEqual([]);
	});
});

describe("formatUptime", () => {
	test("seconds / minutes / hours / days", () => {
		expect(formatUptime(30)).toBe("30s");
		expect(formatUptime(150)).toBe("2m");
		expect(formatUptime(3600)).toBe("1h");
		expect(formatUptime(3700)).toBe("1h 1m");
		expect(formatUptime(86_400)).toBe("1d");
		expect(formatUptime(90_000)).toBe("1d 1h");
	});
});
