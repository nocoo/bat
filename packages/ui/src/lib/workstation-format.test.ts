import type {
	WorkstationConnectivityPoint,
	WorkstationRecord,
	WorkstationReportRecord,
} from "@bat/shared";
import { describe, expect, test } from "vitest";
import {
	connectivityHistoryLoss,
	describeHistory,
	formatLoss,
	formatPercent,
	formatRtt,
	formatUptime,
	latestOs,
	mergeMetricPages,
	rootDiskUsedPct,
	workstationCollectionErrors,
	workstationLastSeen,
	workstationStatusLabel,
} from "./workstation-format";

function report(overrides: Partial<WorkstationReportRecord> = {}): WorkstationReportRecord {
	return {
		report_id: "00000000-0000-4000-8000-000000000001",
		started_at: 100,
		finished_at: 101,
		sample_window_ms: 500,
		cli_version: "2.4.2",
		hostname: "field-laptop",
		os: "macOS 15.5",
		arch: "aarch64",
		uptime_seconds: 3600,
		cpu: { model: "Apple M3 Pro", count: 12, usage_pct: 24.6 },
		mem: { total_bytes: 100, available_bytes: 40, used_pct: 60 },
		disk: [
			{ mount: "/Volumes/Data", total_bytes: 100, available_bytes: 40, used_pct: 60 },
			{ mount: "/", total_bytes: 200, available_bytes: 150, used_pct: 25 },
		],
		network: { interfaces: [] },
		connectivity: [],
		collection_errors: ["disk collector denied"],
		targets_error: null,
		received_at: 110,
		...overrides,
	};
}

function record(overrides: Partial<WorkstationRecord> = {}): WorkstationRecord {
	return {
		id: "11111111-1111-4111-8111-111111111111",
		owner: "email:operator@example.test",
		name: "Field laptop",
		created_at: 1,
		last_seen_at: 2,
		public_ip: "203.0.113.24",
		disabled: false,
		latest_report: report(),
		...overrides,
	};
}

describe("workstation formatters", () => {
	test("percentages keep one decimal and never invent a value for null", () => {
		expect(formatPercent(37.54)).toBe("37.5%");
		expect(formatPercent(0)).toBe("0%");
		expect(formatPercent(null)).toBe("—");
		expect(formatPercent(undefined)).toBe("—");
		expect(formatPercent(Number.NaN)).toBe("—");
	});

	test("RTT keeps a genuine zero and only null is unavailable", () => {
		expect(formatRtt(0)).toBe("0 ms");
		expect(formatRtt(0.44)).toBe("0.4 ms");
		expect(formatRtt(22.16)).toBe("22.2 ms");
		expect(formatRtt(null)).toBe("—");
		expect(formatRtt(Number.POSITIVE_INFINITY)).toBe("—");
	});

	test("only executed network observations report loss", () => {
		expect(formatLoss({ status: "reachable", sent: 3, received: 3 })).toBe("0%");
		expect(formatLoss({ status: "partial", sent: 3, received: 2 })).toBe("33.3%");
		expect(formatLoss({ status: "timeout", sent: 3, received: 0 })).toBe("100%");
		expect(formatLoss({ status: "unreachable", sent: 3, received: 0 })).toBe("100%");
		expect(formatLoss({ status: "error", sent: 3, received: 0 })).toBe("—");
		expect(formatLoss({ status: "error", sent: 3, received: 1 })).toBe("—");
		expect(formatLoss({ status: "unsupported", sent: 3, received: 0 })).toBe("—");
		expect(formatLoss({ status: "timeout", sent: 0, received: 0 })).toBe("—");
	});

	test("history loss keeps local failures as gaps and real loss as samples", () => {
		const point = (
			status: WorkstationConnectivityPoint["status"],
			received: number,
		): WorkstationConnectivityPoint => ({
			received_at: 1,
			received,
			rtt_avg_ms: null,
			rtt_min_ms: null,
			rtt_max_ms: null,
			status,
		});
		expect(connectivityHistoryLoss(point("reachable", 3))).toBe(0);
		expect(connectivityHistoryLoss(point("partial", 1))).toBeCloseTo(66.6667, 4);
		expect(connectivityHistoryLoss(point("timeout", 0))).toBe(100);
		expect(connectivityHistoryLoss(point("unreachable", 0))).toBe(100);
		expect(connectivityHistoryLoss(point("error", 0))).toBeNull();
		expect(connectivityHistoryLoss(point("unsupported", 0))).toBeNull();
	});

	test("uptime distinguishes just-booted zero from missing data", () => {
		expect(formatUptime(0)).toBe("0s");
		expect(formatUptime(45)).toBe("45s");
		expect(formatUptime(90)).toBe("1m");
		expect(formatUptime(3700)).toBe("1h 1m");
		expect(formatUptime(90000)).toBe("1d 1h");
		expect(formatUptime(null)).toBe("—");
		expect(formatUptime(-1)).toBe("—");
		expect(formatUptime(Number.NaN)).toBe("—");
	});

	test("root disk prefers the exact root mount and falls back to the first mount", () => {
		expect(rootDiskUsedPct(report())).toBe(25);
		expect(
			rootDiskUsedPct(
				report({
					disk: [{ mount: "/var", total_bytes: 10, available_bytes: 5, used_pct: 50 }],
				}),
			),
		).toBe(50);
		expect(rootDiskUsedPct(report({ disk: [] }))).toBeNull();
		expect(rootDiskUsedPct(null)).toBeNull();
	});

	test("record accessors stay honest for a workstation without a report", () => {
		expect(latestOs(record())).toBe("macOS 15.5");
		expect(latestOs(record({ latest_report: null }))).toBeNull();
		expect(workstationCollectionErrors(record())).toEqual(["disk collector denied"]);
		expect(workstationCollectionErrors(record({ latest_report: null }))).toEqual([]);
	});

	test("status labels use informational language", () => {
		expect(workstationStatusLabel("recent")).toBe("Recent");
		expect(workstationStatusLabel("stale")).toBe("Stale");
		expect(workstationStatusLabel("disabled")).toBe("Disabled");
	});

	test("last seen renders Never for null and a relative value otherwise", () => {
		expect(workstationLastSeen(null)).toBe("Never");
		expect(workstationLastSeen(1000, 1060)).toBe("1m ago");
	});
});

describe("history summaries", () => {
	test("newest and older pages merge oldest first", () => {
		expect(
			mergeMetricPages(
				[{ received_at: 3 } as never],
				[{ received_at: 1 } as never, { received_at: 2 } as never],
			).map((point) => point.received_at),
		).toEqual([1, 2, 3]);
	});

	test("a capped page explains that older samples are not loaded", () => {
		expect(
			describeHistory({
				windowLabel: "Last 24 hours",
				newestCount: 100,
				olderCount: 0,
				hasOlderBeyond: true,
			}),
		).toEqual({
			label: "Last 24 hours · 100 samples",
			note: "The newest 100 samples are loaded. Older samples in this window are not loaded.",
		});
	});

	test("loaded older samples update the count without claiming completeness", () => {
		expect(
			describeHistory({
				windowLabel: "Last 24 hours",
				newestCount: 100,
				olderCount: 20,
				hasOlderBeyond: false,
			}),
		).toEqual({ label: "Last 24 hours · 120 samples", note: null });
		expect(
			describeHistory({
				windowLabel: "Last 24 hours",
				newestCount: 100,
				olderCount: 100,
				hasOlderBeyond: true,
			}),
		).toEqual({
			label: "Last 24 hours · 200 samples",
			note: "Loaded 200 samples; older samples may remain in this window.",
		});
		expect(
			describeHistory({
				windowLabel: "Last hour",
				newestCount: 1,
				olderCount: 0,
				hasOlderBeyond: false,
			}),
		).toEqual({ label: "Last hour · 1 sample", note: null });
	});
});
