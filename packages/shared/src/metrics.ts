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
	// Tier 3 extensions (optional — omitted by probes < v0.4.0)
	context_switches_sec?: number;
	forks_sec?: number;
	procs_running?: number;
	procs_blocked?: number;
}

export interface MemMetrics {
	total_bytes: number;
	available_bytes: number;
	used_pct: number;
	// Tier 3 extension
	oom_kills_delta?: number;
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

// --- Tier 3 types (design: docs/09-tier3-signals.md) ---

export interface PsiMetrics {
	cpu_some_avg10: number;
	cpu_some_avg60: number;
	cpu_some_avg300: number;
	mem_some_avg10: number;
	mem_some_avg60: number;
	mem_some_avg300: number;
	mem_full_avg10: number;
	mem_full_avg60: number;
	mem_full_avg300: number;
	io_some_avg10: number;
	io_some_avg60: number;
	io_some_avg300: number;
	io_full_avg10: number;
	io_full_avg60: number;
	io_full_avg300: number;
}

export interface DiskIoMetric {
	device: string;
	read_iops: number;
	write_iops: number;
	read_bytes_sec: number;
	write_bytes_sec: number;
	io_util_pct: number;
}

export interface TcpMetrics {
	established: number;
	time_wait: number;
	orphan: number;
	allocated: number;
}

export interface FdMetrics {
	allocated: number;
	max: number;
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
	// Tier 3 additions (optional — omitted by probes < v0.4.0)
	psi?: PsiMetrics;
	disk_io?: DiskIoMetric[];
	tcp?: TcpMetrics;
	fd?: FdMetrics;
}
