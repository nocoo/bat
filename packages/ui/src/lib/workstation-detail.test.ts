import type {
	WorkstationConnectivity,
	WorkstationConnectivityHistory,
	WorkstationConnectivityPoint,
	WorkstationMetricPoint,
} from "@bat/shared";
import { describe, expect, it } from "vitest";
import {
	answeringSeries,
	buildTargetRows,
	capacitySeries,
	clockLabel,
	medianRttSeries,
	overallRttP95,
	percentile,
	reachabilitySeries,
	reachableCount,
	rttStats,
	statusColor,
	statusLabel,
	statusMix,
	targetColor,
	uptimeDaysLabel,
} from "./workstation-detail";

const point = (
	received_at: number,
	rtt: number | null,
	received: number,
	status: WorkstationConnectivityPoint["status"] = rtt === null ? "timeout" : "reachable",
): WorkstationConnectivityPoint => ({
	received_at,
	received,
	rtt_avg_ms: rtt,
	rtt_min_ms: rtt,
	rtt_max_ms: rtt,
	status,
});

const target = (
	server_id: string,
	data: WorkstationConnectivityPoint[],
	address = "203.0.113.1",
): WorkstationConnectivityHistory => ({
	server_id,
	address,
	family: 4,
	data,
});

const entry = (
	server_id: string,
	overrides: Partial<WorkstationConnectivity> = {},
): WorkstationConnectivity => ({
	server_id,
	address: "203.0.113.1",
	family: 4,
	sent: 3,
	received: 3,
	rtts_ms: [1, 2, 3],
	status: "reachable",
	...overrides,
});

const metric = (
	received_at: number,
	overrides: Partial<WorkstationMetricPoint> = {},
): WorkstationMetricPoint => ({
	received_at,
	started_at: received_at - 1,
	finished_at: received_at,
	cpu_usage_pct: 10,
	mem_used_pct: 20,
	mem_total_bytes: 100,
	mem_available_bytes: 80,
	uptime_seconds: 86_400,
	...overrides,
});

describe("targetColor", () => {
	it("cycles the palette", () => {
		expect(targetColor(0)).not.toBe(targetColor(1));
		expect(targetColor(10)).toBe(targetColor(0));
	});
});

describe("percentile", () => {
	it("returns null without measurements", () => {
		expect(percentile([], 0.5)).toBeNull();
		expect(percentile([Number.NaN], 0.5)).toBeNull();
	});

	it("returns the single value for any fraction", () => {
		expect(percentile([42], 0.95)).toBe(42);
	});

	it("uses nearest rank on sorted finite values", () => {
		expect(percentile([10, 20, 30, 40], 0.5)).toBe(20);
		expect(percentile([40, 10, 30, 20], 0.95)).toBe(40);
		expect(percentile([10, 20, Number.POSITIVE_INFINITY], 0.5)).toBe(10);
	});
});

describe("rttStats", () => {
	it("keeps timeouts as gaps instead of zeros", () => {
		expect(rttStats([])).toEqual({
			last: null,
			avg: null,
			min: null,
			max: null,
			p50: null,
			p95: null,
			samples: 0,
			answering: 0,
		});
		const stats = rttStats([point(1, null, 0), point(2, null, 0)]);
		expect(stats).toMatchObject({ last: null, samples: 2, answering: 0 });
	});

	it("summarises the answering samples only", () => {
		const stats = rttStats([point(3, 30, 3), point(1, 10, 3), point(2, null, 0)]);
		expect(stats).toEqual({
			last: 30,
			avg: 20,
			min: 10,
			max: 30,
			p50: 10,
			p95: 30,
			samples: 3,
			answering: 2,
		});
	});
});

describe("buildTargetRows", () => {
	it("joins the latest report with history and sorts by server id", () => {
		const rows = buildTargetRows({
			latest: [entry("pw-host-beta", { status: "partial", received: 2, rtts_ms: [1, null, 3] })],
			history: [
				target("pw-host-beta", [point(2, 20, 3), point(1, 10, 3)]),
				target("pw-host-alpha", [point(1, 5, 3)]),
			],
			serverName: (id) => id.toUpperCase(),
		});
		expect(rows.map((row) => row.serverId)).toEqual(["pw-host-alpha", "pw-host-beta"]);
		expect(rows[0]).toMatchObject({
			name: "PW-HOST-ALPHA",
			address: "203.0.113.1",
			family: 4,
			status: "reachable",
			last: 5,
			samples: 1,
		});
		expect(rows[1]).toMatchObject({ status: "partial", lossPct: 33.33333333333333, last: 20 });
	});

	it("keeps history-only targets readable", () => {
		const rows = buildTargetRows({
			latest: [],
			history: [target("orphan", [point(1, null, 0, "error")], "198.51.100.7")],
			serverName: (id) => id,
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			address: "198.51.100.7",
			family: 4,
			status: "error",
			received: 0,
			sent: 3,
			last: null,
			lossPct: null,
		});
	});

	it("uses the shared ping count when the latest report is missing", () => {
		const [row] = buildTargetRows({
			latest: [],
			history: [target("only-history", [point(1, 12, 3)])],
			serverName: (id) => id,
		});
		expect(row).toMatchObject({ sent: 3, lossPct: 0, status: "reachable" });
	});

	it("falls back to unsupported when nothing was measured", () => {
		const [row] = buildTargetRows({
			latest: [],
			history: [target("silent", [])],
			serverName: (id) => id,
		});
		expect(row).toMatchObject({ status: "unsupported", received: 0, lossPct: null });
	});
});

describe("reachabilitySeries", () => {
	it("aligns targets on one timeline and leaves gaps", () => {
		const rows = buildTargetRows({
			latest: [],
			history: [target("a", [point(2, 20, 3), point(1, 10, 3)]), target("b", [point(2, null, 0)])],
			serverName: (id) => id,
		});
		const series = reachabilitySeries(rows);
		expect(series.keys.map((key) => key.key)).toEqual(["s0", "s1"]);
		expect(series.data).toEqual([
			{ x: 1000, s0: 10, s1: null },
			{ x: 2000, s0: 20, s1: null },
		]);
	});

	it("returns no rows without targets", () => {
		expect(reachabilitySeries([])).toEqual({ data: [], keys: [] });
	});
});

describe("answeringSeries", () => {
	it("counts targets that answered at each sample time", () => {
		const rows = buildTargetRows({
			latest: [],
			history: [
				target("a", [point(1, 10, 3), point(2, 20, 3)]),
				target("b", [point(1, null, 0), point(2, 30, 3)]),
			],
			serverName: (id) => id,
		});
		expect(answeringSeries(rows)).toEqual([
			{ x: 1000, value: 1 },
			{ x: 2000, value: 2 },
		]);
		expect(answeringSeries([])).toEqual([]);
	});
});

describe("median and p95 round-trip time", () => {
	const rows = () =>
		buildTargetRows({
			latest: [],
			history: [
				target("a", [point(1, 10, 3), point(2, 40, 3)]),
				target("b", [point(1, 30, 3), point(2, null, 0)]),
				target("c", [point(1, 100, 3), point(2, 200, 3)]),
			],
			serverName: (id) => id,
		});

	it("takes the median of answering targets per sample", () => {
		expect(medianRttSeries(rows())).toEqual([
			{ x: 1000, value: 30 },
			{ x: 2000, value: 40 },
		]);
	});

	it("summarises the window with p95", () => {
		expect(overallRttP95(rows())).toBeCloseTo(200);
		expect(overallRttP95([])).toBeNull();
	});
});

describe("capacitySeries", () => {
	it("sorts samples and converts uptime to days", () => {
		const series = capacitySeries([metric(200, { cpu_usage_pct: null }), metric(100)]);
		expect(series).toEqual([
			{ x: 100_000, cpu: 10, mem: 20, uptime: 1 },
			{ x: 200_000, cpu: null, mem: 20, uptime: 1 },
		]);
	});

	it("converts sub-day uptime", () => {
		const [only] = capacitySeries([metric(5, { uptime_seconds: 3600 })]);
		expect(only?.uptime).toBeCloseTo(1 / 24);
	});
});

describe("status mix", () => {
	it("labels and colours every status", () => {
		expect(statusLabel("reachable")).toBe("Reachable");
		expect(statusLabel("partial")).toBe("Partial");
		expect(statusLabel("error")).toBe("Local error");
		expect(statusColor("timeout")).not.toBe(statusColor("reachable"));
	});

	it("counts only the newest result per target, largest first", () => {
		const rows = buildTargetRows({
			latest: [
				entry("a"),
				entry("b", { status: "timeout", received: 0 }),
				entry("c", { status: "timeout", received: 0 }),
			],
			history: [],
			serverName: (id) => id,
		});
		expect(statusMix(rows)).toEqual([
			{ name: "Timeout", value: 2, color: statusColor("timeout") },
			{ name: "Reachable", value: 1, color: statusColor("reachable") },
		]);
		expect(reachableCount(rows)).toBe(1);
	});

	it("is empty without targets", () => {
		expect(statusMix([])).toEqual([]);
		expect(reachableCount([])).toBe(0);
	});
});

describe("labels", () => {
	it("formats an intraday clock", () => {
		const value = new Date("2026-11-07T09:16:00Z").getTime();
		expect(clockLabel(value, 86_400)).toMatch(/\d{1,2}:\d{2}/);
		expect(clockLabel(value, 604_800)).toBe(clockLabel(value, 604_800));
		expect(clockLabel("nonsense", 86_400)).toBe("—");
	});

	it("formats uptime days and hours", () => {
		expect(uptimeDaysLabel(null)).toBe("—");
		expect(uptimeDaysLabel(3.6)).toBe("3.6d");
		expect(uptimeDaysLabel(0.5)).toBe("12h");
	});
});
