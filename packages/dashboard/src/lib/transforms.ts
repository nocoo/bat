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
	if (data.length === 0) {
		return [];
	}

	// Use last data point for current disk status
	const latest = data[data.length - 1];
	if (!latest?.disk_json) {
		return [];
	}

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
	if (bytesPerSec < 1024) {
		return `${bytesPerSec.toFixed(0)} B/s`;
	}
	if (bytesPerSec < 1024 * 1024) {
		return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
	}
	if (bytesPerSec < 1024 * 1024 * 1024) {
		return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
	}
	return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
}

/** Format bytes to human readable */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	if (bytes < 1024 * 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
	if (bytes < 1024 * 1024 * 1024 * 1024) {
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
	}
	return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(1)} TB`;
}

// --- PSI Pressure Chart ---
export interface PsiChartPoint {
	ts: number;
	cpu: number;
	memory: number;
	io: number;
}

/** Transform PSI avg60 values for chart display. Returns empty if no PSI data present. */
export function transformPsiData(data: MetricsDataPoint[]): PsiChartPoint[] {
	const hasAny = data.some((d) => d.psi_cpu_some_avg60 != null);
	if (!hasAny) {
		return [];
	}

	return data.map((d) => ({
		ts: d.ts,
		cpu: d.psi_cpu_some_avg60 ?? 0,
		memory: d.psi_mem_some_avg60 ?? 0,
		io: d.psi_io_some_avg60 ?? 0,
	}));
}

// --- Disk I/O Chart ---
export interface DiskIoChartPoint {
	ts: number;
	read_iops: number;
	write_iops: number;
	io_util_pct: number;
}

/** Raw disk_io_json entry (from probe, ≤24h) */
interface DiskIoRawEntry {
	device: string;
	read_iops: number;
	write_iops: number;
	read_bytes_sec: number;
	write_bytes_sec: number;
	io_util_pct: number;
}

/** Hourly aggregated disk_io_json entry (>24h) */
interface DiskIoHourlyEntry {
	device: string;
	read_iops_avg: number;
	write_iops_avg: number;
	read_bytes_sec_avg: number;
	write_bytes_sec_avg: number;
	io_util_pct_avg: number;
	io_util_pct_max: number;
}

/**
 * Resolution-aware disk I/O data transform.
 * - Raw (≤ 24h): Uses raw field names (read_iops, write_iops, io_util_pct).
 * - Hourly (> 24h): Uses aggregated field names (read_iops_avg, write_iops_avg, io_util_pct_avg).
 * Aggregates across all devices (max io_util, sum IOPS).
 */
export function transformDiskIoData(
	data: MetricsDataPoint[],
	resolution: "raw" | "hourly" = "raw",
): DiskIoChartPoint[] {
	const hasAny = data.some((d) => d.disk_io_json != null);
	if (!hasAny) {
		return [];
	}

	return data.map((d) => {
		let readIops = 0;
		let writeIops = 0;
		let ioUtil = 0;
		if (d.disk_io_json) {
			try {
				if (resolution === "hourly") {
					const entries = JSON.parse(d.disk_io_json) as DiskIoHourlyEntry[];
					for (const e of entries) {
						readIops += e.read_iops_avg ?? 0;
						writeIops += e.write_iops_avg ?? 0;
						ioUtil = Math.max(ioUtil, e.io_util_pct_avg ?? 0);
					}
				} else {
					const entries = JSON.parse(d.disk_io_json) as DiskIoRawEntry[];
					for (const e of entries) {
						readIops += e.read_iops ?? 0;
						writeIops += e.write_iops ?? 0;
						ioUtil = Math.max(ioUtil, e.io_util_pct ?? 0);
					}
				}
			} catch {
				// invalid JSON — return zeros
			}
		}
		return { ts: d.ts, read_iops: readIops, write_iops: writeIops, io_util_pct: ioUtil };
	});
}

// --- TCP Chart ---
export interface TcpChartPoint {
	ts: number;
	established: number;
	time_wait: number;
	orphan: number;
}

/** Transform TCP connection state data. Returns empty if no TCP data present. */
export function transformTcpData(data: MetricsDataPoint[]): TcpChartPoint[] {
	const hasAny = data.some((d) => d.tcp_established != null);
	if (!hasAny) {
		return [];
	}

	return data.map((d) => ({
		ts: d.ts,
		established: d.tcp_established ?? 0,
		time_wait: d.tcp_time_wait ?? 0,
		orphan: d.tcp_orphan ?? 0,
	}));
}

// --- Top Processes Table ---
export interface TopProcessEntry {
	pid: number;
	name: string;
	cmd: string;
	state: string;
	ppid: number;
	user: string;
	cpu_pct: number | null;
	mem_rss: number;
	mem_pct: number;
	mem_virt: number;
	num_threads: number;
	uptime: number;
	majflt_rate: number | null;
	io_read_rate: number | null;
	io_write_rate: number | null;
	processor: number;
}

/**
 * Extract top processes from the latest data point's top_processes_json.
 * Returns empty array if no data or hourly resolution (not applicable).
 */
export function transformTopProcessesData(data: MetricsDataPoint[]): TopProcessEntry[] {
	if (data.length === 0) {
		return [];
	}

	// Find last data point that has top_processes_json
	for (let i = data.length - 1; i >= 0; i--) {
		const point = data[i];
		if (point?.top_processes_json) {
			try {
				const raw = JSON.parse(point.top_processes_json) as TopProcessEntry[];
				return raw.map((p) => ({
					pid: p.pid,
					name: p.name ?? "",
					cmd: p.cmd ?? "",
					state: p.state ?? "?",
					ppid: p.ppid ?? 0,
					user: p.user ?? "",
					cpu_pct: p.cpu_pct ?? null,
					mem_rss: p.mem_rss ?? 0,
					mem_pct: p.mem_pct ?? 0,
					mem_virt: p.mem_virt ?? 0,
					num_threads: p.num_threads ?? 0,
					uptime: p.uptime ?? 0,
					majflt_rate: p.majflt_rate ?? null,
					io_read_rate: p.io_read_rate ?? null,
					io_write_rate: p.io_write_rate ?? null,
					processor: p.processor ?? -1,
				}));
			} catch {
				return [];
			}
		}
	}

	return [];
}

/** Format seconds into human-readable uptime (e.g. "2d 3h", "15m", "30s") */
export function formatUptime(seconds: number): string {
	if (seconds < 60) {
		return `${seconds}s`;
	}
	if (seconds < 3600) {
		return `${Math.floor(seconds / 60)}m`;
	}
	if (seconds < 86400) {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		return m > 0 ? `${h}h ${m}m` : `${h}h`;
	}
	const d = Math.floor(seconds / 86400);
	const h = Math.floor((seconds % 86400) / 3600);
	return h > 0 ? `${d}d ${h}h` : `${d}d`;
}
