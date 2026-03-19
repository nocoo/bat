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
	// Signal expansion (optional — omitted by probes < v0.6.0)
	interrupts_sec?: number;
	softirq_net_rx_sec?: number;
	softirq_block_sec?: number;
	tasks_running?: number;
	tasks_total?: number;
}

export interface MemMetrics {
	total_bytes: number;
	available_bytes: number;
	used_pct: number;
	// Tier 3 extension
	oom_kills_delta?: number;
	// Extended meminfo fields
	buffers?: number;
	cached?: number;
	dirty?: number;
	writeback?: number;
	shmem?: number;
	slab_reclaimable?: number;
	slab_unreclaim?: number;
	committed_as?: number;
	commit_limit?: number;
	hw_corrupted?: number;
	// Vmstat rate fields
	swap_in_sec?: number;
	swap_out_sec?: number;
	pgmajfault_sec?: number;
	pgpgin_sec?: number;
	pgpgout_sec?: number;
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
	inodes_total?: number;
	inodes_avail?: number;
	inodes_used_pct?: number;
}

export interface NetMetric {
	iface: string;
	rx_bytes_rate: number;
	tx_bytes_rate: number;
	rx_errors: number;
	tx_errors: number;
	rx_packets_rate?: number;
	tx_packets_rate?: number;
	rx_dropped?: number;
	tx_dropped?: number;
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
	// Total microsecond deltas
	cpu_some_total_delta?: number;
	mem_some_total_delta?: number;
	mem_full_total_delta?: number;
	io_some_total_delta?: number;
	io_full_total_delta?: number;
}

export interface DiskIoMetric {
	device: string;
	read_iops: number;
	write_iops: number;
	read_bytes_sec: number;
	write_bytes_sec: number;
	io_util_pct: number;
	read_await_ms?: number;
	write_await_ms?: number;
	io_queue_depth?: number;
}

export interface TcpMetrics {
	established: number;
	time_wait: number;
	orphan: number;
	allocated: number;
	mem_pages?: number;
}

export interface FdMetrics {
	allocated: number;
	max: number;
}

// --- Signal expansion types ---

export interface SocketMetrics {
	sockets_used: number;
}

export interface UdpMetrics {
	inuse: number;
	mem_pages: number;
}

export interface SnmpMetrics {
	retrans_segs_sec?: number;
	active_opens_sec?: number;
	passive_opens_sec?: number;
	attempt_fails_delta?: number;
	estab_resets_delta?: number;
	in_errs_delta?: number;
	out_rsts_delta?: number;
	udp_rcvbuf_errors_delta?: number;
	udp_sndbuf_errors_delta?: number;
	udp_in_errors_delta?: number;
}

export interface NetstatMetrics {
	listen_overflows_delta?: number;
	listen_drops_delta?: number;
	tcp_timeouts_delta?: number;
	tcp_syn_retrans_delta?: number;
	tcp_fast_retrans_delta?: number;
	tcp_ofo_queue_delta?: number;
	tcp_abort_on_memory_delta?: number;
	syncookies_sent_delta?: number;
}

export interface SoftnetMetrics {
	processed_delta?: number;
	dropped_delta?: number;
	time_squeeze_delta?: number;
}

export interface ConntrackMetrics {
	count: number;
	max: number;
}

export interface TopProcess {
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
	io_read_rate?: number | null;
	io_write_rate?: number | null;
	processor: number;
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
	// Signal expansion (optional — omitted by probes < v0.6.0)
	socket?: SocketMetrics;
	udp?: UdpMetrics;
	snmp?: SnmpMetrics;
	netstat?: NetstatMetrics;
	softnet?: SoftnetMetrics;
	conntrack?: ConntrackMetrics;
	top_processes?: TopProcess[];
}
