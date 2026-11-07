// Pure view-model helpers for the workstation detail page. Everything that can
// be decided without React lives here so the route stays thin and every honest
// null stays unit-testable.

import type {
	WorkstationConnectivity,
	WorkstationConnectivityHistory,
	WorkstationConnectivityPoint,
	WorkstationConnectivityStatus,
	WorkstationMetricPoint,
} from "@bat/shared";
import { chart } from "./palette";
import { connectivityHistoryLoss, connectivityLoss } from "./workstation-format";

const TARGET_COLORS: readonly string[] = [
	chart.pink,
	chart.sky,
	chart.amber,
	chart.teal,
	chart.purple,
	chart.green,
	chart.orange,
	chart.indigo,
	chart.lime,
	chart.red,
];

export function targetColor(index: number): string {
	return TARGET_COLORS[index % TARGET_COLORS.length] as string;
}

/** Nearest-rank percentile over finite values; null when nothing is measured. */
export function percentile(values: readonly number[], fraction: number): number | null {
	const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
	if (sorted.length === 0) {
		return null;
	}
	if (sorted.length === 1) {
		return sorted[0] as number;
	}
	const rank = Math.ceil(fraction * sorted.length) - 1;
	return sorted[Math.min(sorted.length - 1, Math.max(0, rank))] as number;
}

export interface RttStats {
	last: number | null;
	avg: number | null;
	min: number | null;
	max: number | null;
	p50: number | null;
	p95: number | null;
	samples: number;
	answering: number;
}

const EMPTY_STATS: RttStats = {
	last: null,
	avg: null,
	min: null,
	max: null,
	p50: null,
	p95: null,
	samples: 0,
	answering: 0,
};

/** RTT summaries over the answering samples only; timeouts stay gaps, not zeros. */
export function rttStats(points: readonly WorkstationConnectivityPoint[]): RttStats {
	if (points.length === 0) {
		return EMPTY_STATS;
	}
	const values = points
		.map((point) => point.rtt_avg_ms)
		.filter((value): value is number => value !== null && Number.isFinite(value));
	if (values.length === 0) {
		return { ...EMPTY_STATS, samples: points.length };
	}
	const total = values.reduce((sum, value) => sum + value, 0);
	let latest = Number.NEGATIVE_INFINITY;
	let last: number | null = null;
	for (const point of points) {
		if (point.rtt_avg_ms !== null && point.received_at >= latest) {
			latest = point.received_at;
			last = point.rtt_avg_ms;
		}
	}
	return {
		last,
		avg: total / values.length,
		min: Math.min(...values),
		max: Math.max(...values),
		p50: percentile(values, 0.5),
		p95: percentile(values, 0.95),
		samples: points.length,
		answering: values.length,
	};
}

export interface TargetSeriesPoint {
	x: number;
	value: number | null;
	loss: number | null;
}

export interface TargetRow extends RttStats {
	serverId: string;
	name: string;
	address: string | null;
	family: 4 | 6 | null;
	status: WorkstationConnectivityStatus;
	received: number;
	sent: number;
	lossPct: number | null;
	color: string;
	series: TargetSeriesPoint[];
}

export interface TargetRowInput {
	history: readonly WorkstationConnectivityHistory[];
	latest: readonly WorkstationConnectivity[];
	serverName: (serverId: string) => string;
}

/**
 * One row per target, joining the latest report (authoritative status, address,
 * packet counts) with its history (shape and percentiles). A target that only
 * exists in history keeps a null address instead of a fabricated one.
 */
export function buildTargetRows({ history, latest, serverName }: TargetRowInput): TargetRow[] {
	const latestById = new Map(latest.map((entry) => [entry.server_id, entry]));
	const ids = [
		...new Set([...latest.map((entry) => entry.server_id), ...history.map((t) => t.server_id)]),
	].sort((a, b) => a.localeCompare(b));

	return ids.map((serverId, index) => {
		const latestEntry = latestById.get(serverId);
		const historyEntry = history.find((target) => target.server_id === serverId);
		const points = historyEntry?.data ?? [];
		const stats = rttStats(points);
		const answerStatus = latestEntry?.status ?? points[0]?.status ?? "unsupported";
		const received = latestEntry?.received ?? points[0]?.received ?? 0;
		const sent = latestEntry?.sent ?? 3;

		return {
			...stats,
			serverId,
			name: serverName(serverId),
			address: latestEntry?.address ?? historyEntry?.address ?? null,
			family: latestEntry?.family ?? historyEntry?.family ?? null,
			status: answerStatus,
			received,
			sent,
			lossPct: latestEntry
				? connectivityLoss(latestEntry)
				: points[0]
					? connectivityHistoryLoss(points[0])
					: null,
			color: targetColor(index),
			series: points.map((point) => ({
				x: point.received_at * 1000,
				value: point.rtt_avg_ms,
				loss: connectivityHistoryLoss(point),
			})),
		};
	});
}

export interface ReachabilitySeries {
	data: Array<{ x: number } & Record<string, number | null>>;
	keys: { key: string; label: string; color: string; serverId: string }[];
}

/** Align every target onto the shared sample timeline; missing samples stay null. */
export function reachabilitySeries(rows: readonly TargetRow[]): ReachabilitySeries {
	const times = [...new Set(rows.flatMap((row) => row.series.map((point) => point.x)))].sort(
		(a, b) => a - b,
	);
	const keys = rows.map((row, index) => ({
		key: `s${index}`,
		label: row.name,
		color: row.color,
		serverId: row.serverId,
	}));
	const data = times.map((x) => {
		const point: { x: number } & Record<string, number | null> = { x };
		rows.forEach((row, index) => {
			const sample = row.series.find((entry) => entry.x === x);
			point[`s${index}`] = sample ? sample.value : null;
		});
		return point;
	});
	return { data, keys };
}

/** Median round-trip time per sample time across the targets that answered. */
export function medianRttSeries(rows: readonly TargetRow[]): { x: number; value: number }[] {
	const byTime = new Map<number, number[]>();
	for (const row of rows) {
		for (const point of row.series) {
			if (point.value === null) {
				continue;
			}
			byTime.set(point.x, [...(byTime.get(point.x) ?? []), point.value]);
		}
	}
	return [...byTime.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([x, values]) => ({ x, value: percentile(values, 0.5) as number }));
}

/** P95 across every answering sample in the window, or null without samples. */
export function overallRttP95(rows: readonly TargetRow[]): number | null {
	const values = rows.flatMap((row) =>
		row.series
			.map((point) => point.value)
			.filter((value): value is number => value !== null && Number.isFinite(value)),
	);
	return percentile(values, 0.95);
}

/** How many targets answered at each sample time; the header trend uses this. */
export function answeringSeries(rows: readonly TargetRow[]): { x: number; value: number }[] {
	const counts = new Map<number, number>();
	for (const row of rows) {
		for (const point of row.series) {
			const answered = point.value !== null ? 1 : 0;
			counts.set(point.x, (counts.get(point.x) ?? 0) + answered);
		}
	}
	return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([x, value]) => ({ x, value }));
}

export interface CapacityPoint {
	x: number;
	cpu: number | null;
	mem: number | null;
	uptime: number;
}

export function capacitySeries(metrics: readonly WorkstationMetricPoint[]): CapacityPoint[] {
	return metrics
		.slice()
		.sort((a, b) => a.received_at - b.received_at)
		.map((point) => ({
			x: point.received_at * 1000,
			cpu: point.cpu_usage_pct,
			mem: point.mem_used_pct,
			uptime: point.uptime_seconds / 86_400,
		}));
}

export interface StatusSlice {
	name: string;
	value: number;
	color: string;
}

const STATUS_LABEL: Record<WorkstationConnectivityStatus, string> = {
	reachable: "Reachable",
	partial: "Partial",
	timeout: "Timeout",
	unreachable: "Unreachable",
	error: "Local error",
	unsupported: "Unsupported",
};

const STATUS_COLOR: Record<WorkstationConnectivityStatus, string> = {
	reachable: chart.green,
	partial: chart.amber,
	timeout: chart.orange,
	unreachable: chart.red,
	error: chart.purple,
	unsupported: chart.indigo,
};

export function statusLabel(status: WorkstationConnectivityStatus): string {
	return STATUS_LABEL[status];
}

export function statusColor(status: WorkstationConnectivityStatus): string {
	return STATUS_COLOR[status];
}

/** Reachability distribution for the donut; zero-count statuses are dropped. */
export function statusMix(rows: readonly TargetRow[]): StatusSlice[] {
	const counts = new Map<WorkstationConnectivityStatus, number>();
	for (const row of rows) {
		counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
	}
	return [...counts.entries()]
		.filter(([, value]) => value > 0)
		.sort((a, b) => b[1] - a[1])
		.map(([status, value]) => ({
			name: STATUS_LABEL[status],
			value,
			color: STATUS_COLOR[status],
		}));
}

export function reachableCount(rows: readonly TargetRow[]): number {
	return rows.filter((row) => row.status === "reachable" || row.status === "partial").length;
}

/** Compact axis label; the precision follows the selected window. */
export function clockLabel(value: string | number, windowSeconds: number): string {
	const date = new Date(Number(value));
	if (Number.isNaN(date.getTime())) {
		return "—";
	}
	if (windowSeconds <= 86_400) {
		return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
	}
	return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function uptimeDaysLabel(days: number | null): string {
	if (days === null || !Number.isFinite(days)) {
		return "—";
	}
	return days >= 1 ? `${Math.round(days * 10) / 10}d` : `${Math.round(days * 24)}h`;
}
