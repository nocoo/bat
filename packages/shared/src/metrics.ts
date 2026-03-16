// @bat/shared — Metrics payload types
// Probe → Worker communication (POST /api/ingest)
// Source of truth: docs/03-data-structures.md § Communication Payloads

export interface CpuMetrics {
	load1: number;
	load5: number;
	load15: number;
	usage_pct: number;
	iowait_pct: number;
	steal_pct: number;
	count: number;
}

export interface MemMetrics {
	total_bytes: number;
	available_bytes: number;
	used_pct: number;
}

export interface SwapMetrics {
	total_bytes: number;
	used_bytes: number;
	used_pct: number;
}

export interface DiskMetric {
	mount: string;
	total_bytes: number;
	avail_bytes: number;
	used_pct: number;
}

export interface NetMetric {
	iface: string;
	rx_bytes_rate: number;
	tx_bytes_rate: number;
	rx_errors: number;
	tx_errors: number;
}

export interface MetricsPayload {
	probe_version?: string;
	host_id: string;
	timestamp: number; // Unix seconds, Probe clock
	interval: number; // 30
	cpu: CpuMetrics;
	mem: MemMetrics;
	swap: SwapMetrics;
	disk: DiskMetric[];
	net: NetMetric[];
	uptime_seconds: number;
}
