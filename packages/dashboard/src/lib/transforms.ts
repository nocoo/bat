// Data transformation functions for charts
// Pure functions: MetricsDataPoint[] → chart-ready data
import type { MetricsDataPoint } from "@bat/shared";

// --- CPU Chart ---
export interface CpuChartPoint {
	ts: number;
	usage: number;
	iowait: number;
	steal: number;
}

export function transformCpuData(data: MetricsDataPoint[]): CpuChartPoint[] {
	return data.map((d) => ({
		ts: d.ts,
		usage: d.cpu_usage_pct ?? 0,
		iowait: d.cpu_iowait ?? 0,
		steal: d.cpu_steal ?? 0,
	}));
}

// --- Memory Chart ---
export interface MemChartPoint {
	ts: number;
	used_pct: number;
}

export function transformMemData(data: MetricsDataPoint[]): MemChartPoint[] {
	return data.map((d) => ({
		ts: d.ts,
		used_pct: d.mem_used_pct ?? 0,
	}));
}

// --- Network Chart ---
export interface NetChartPoint {
	ts: number;
	rx_rate: number;
	tx_rate: number;
}

interface NetJsonEntry {
	iface: string;
	rx_bytes_rate: number;
	tx_bytes_rate: number;
}

/**
 * Resolution-aware network data transform.
 * - Raw (≤ 24h): Parses net_json, aggregates across interfaces.
 * - Hourly (> 24h): Uses scalar fields net_rx_bytes_avg, net_tx_bytes_avg.
 */
export function transformNetData(
	data: MetricsDataPoint[],
	resolution: "raw" | "hourly",
): NetChartPoint[] {
	if (resolution === "hourly") {
		return data.map((d) => ({
			ts: d.ts,
			rx_rate: d.net_rx_bytes_avg ?? 0,
			tx_rate: d.net_tx_bytes_avg ?? 0,
		}));
	}

	// Raw: parse net_json
	return data.map((d) => {
		let rx = 0;
		let tx = 0;
		if (d.net_json) {
			try {
				const entries = JSON.parse(d.net_json) as NetJsonEntry[];
				for (const e of entries) {
					rx += e.rx_bytes_rate ?? 0;
					tx += e.tx_bytes_rate ?? 0;
				}
			} catch {
				// invalid JSON — return zeros
			}
		}
		return { ts: d.ts, rx_rate: rx, tx_rate: tx };
	});
}

// --- Disk Bars ---
export interface DiskBarEntry {
	mount: string;
	used_pct: number;
	total_bytes: number;
	avail_bytes: number;
}

interface DiskJsonEntry {
	mount: string;
	used_pct: number;
	total_bytes: number;
	avail_bytes: number;
}

/**
 * Parse disk_json from the latest data point.
 * Returns parsed disk entries or empty array on parse failure.
 */
export function transformDiskData(data: MetricsDataPoint[]): DiskBarEntry[] {
	if (data.length === 0) return [];

	// Use last data point for current disk status
	const latest = data[data.length - 1];
	if (!latest?.disk_json) return [];

	try {
		const entries = JSON.parse(latest.disk_json) as DiskJsonEntry[];
		return entries.map((e) => ({
			mount: e.mount,
			used_pct: e.used_pct ?? 0,
			total_bytes: e.total_bytes ?? 0,
			avail_bytes: e.avail_bytes ?? 0,
		}));
	} catch {
		return [];
	}
}

// --- Time Formatting ---

/** Threshold in seconds for switching from HH:MM to MM/DD HH:MM (7 days) */
const LONG_RANGE_THRESHOLD = 604800;

/** Format unix timestamp to HH:MM for chart axis labels */
export function formatTime(ts: number): string {
	const d = new Date(ts * 1000);
	return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

/** Format unix timestamp to MM/DD HH:MM for longer ranges */
export function formatDateTime(ts: number): string {
	const d = new Date(ts * 1000);
	const month = (d.getMonth() + 1).toString().padStart(2, "0");
	const day = d.getDate().toString().padStart(2, "0");
	const hours = d.getHours().toString().padStart(2, "0");
	const minutes = d.getMinutes().toString().padStart(2, "0");
	return `${month}/${day} ${hours}:${minutes}`;
}

/** Return the appropriate time formatter based on range duration */
export function getTimeFormatter(rangeSeconds: number): (ts: number) => string {
	return rangeSeconds >= LONG_RANGE_THRESHOLD ? formatDateTime : formatTime;
}

/** Format bytes/sec to human readable */
export function formatBytesRate(bytesPerSec: number): string {
	if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
	if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
	if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
	return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
}

/** Format bytes to human readable */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
	return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(1)} TB`;
}
