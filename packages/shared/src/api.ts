// @bat/shared — API route constants, request/response types
// Source of truth: docs/03-data-structures.md § Response DTOs + API Route Constants

import type { AlertSeverity } from "./alerts.js";
import type { BlockDeviceDTO, NetInterfaceDTO } from "./identity.js";

// --- Host ID hashing ---

/**
 * FNV-1a 32-bit hash → 8-char hex string.
 * Used to derive an opaque `hid` from raw `host_id` so that hostnames /
 * domain names are not exposed in dashboard URLs or browser history.
 */
export function hashHostId(hostId: string): string {
	let h = 0x811c9dc5; // FNV offset basis
	for (let i = 0; i < hostId.length; i++) {
		h ^= hostId.charCodeAt(i);
		h = Math.imul(h, 0x01000193); // FNV prime
	}
	return (h >>> 0).toString(16).padStart(8, "0");
}

// --- Route constants ---

export const API_ROUTES = {
	INGEST: "/api/ingest",
	IDENTITY: "/api/identity",
	TIER2_INGEST: "/api/tier2",
	HOSTS: "/api/hosts",
	HOST_METRICS: "/api/hosts/:id/metrics",
	HOST_DETAIL: "/api/hosts/:id",
	HOST_TIER2: "/api/hosts/:id/tier2",
	ALERTS: "/api/alerts",
	LIVE: "/api/live",
} as const;

// --- Response DTOs ---

export type HostStatus = "healthy" | "warning" | "critical" | "offline";

/** Sparkline data point — one hour of aggregated data */
export interface SparklinePoint {
	ts: number; // unix seconds (hour boundary)
	v: number; // value (0–100 pct)
}

/** GET /api/hosts → HostOverviewItem[] */
export interface HostOverviewItem {
	hid: string; // opaque hash of host_id for URL routing
	host_id: string;
	hostname: string;
	os: string | null;
	kernel: string | null;
	arch: string | null;
	cpu_model: string | null;
	boot_time: number | null;
	status: HostStatus;
	cpu_usage_pct: number | null;
	mem_used_pct: number | null;
	uptime_seconds: number | null;
	last_seen: number; // unix seconds (Worker time)
	alert_count: number;
	// Host inventory scalar fields (for list-page subtitle)
	cpu_logical: number | null;
	cpu_physical: number | null;
	mem_total_bytes: number | null;
	virtualization: string | null;
	public_ip: string | null;
	// Extended overview fields
	probe_version: string | null;
	cpu_load1: number | null;
	swap_used_pct: number | null;
	disk_root_used_pct: number | null;
	net_rx_rate: number | null; // bytes/sec aggregate
	net_tx_rate: number | null; // bytes/sec aggregate
	cpu_sparkline: SparklinePoint[] | null; // 24h hourly CPU usage
	mem_sparkline: SparklinePoint[] | null; // 24h hourly Memory usage
	net_sparkline: SparklinePoint[] | null; // 24h hourly Network usage (normalized 0–100)
}

/** GET /api/hosts/:id → HostDetailItem */
export interface HostDetailItem extends HostOverviewItem {
	probe_version: string | null;
	swap_total_bytes: number | null;
	boot_mode: string | null;
	timezone: string | null;
	dns_resolvers: string[] | null;
	dns_search: string[] | null;
	net_interfaces: NetInterfaceDTO[] | null;
	disks: BlockDeviceDTO[] | null;
}

export type MetricsResolution = "raw" | "hourly";

/** GET /api/hosts/:id/metrics → MetricsQueryResponse */
export interface MetricsQueryResponse {
	host_id: string;
	resolution: MetricsResolution;
	from: number;
	to: number;
	data: MetricsDataPoint[];
}

export interface MetricsDataPoint {
	ts: number;
	cpu_usage_pct: number | null;
	cpu_iowait: number | null;
	cpu_steal: number | null;
	cpu_load1: number | null;
	cpu_load5: number | null;
	cpu_load15: number | null;
	cpu_count: number | null;
	mem_total: number | null;
	mem_available: number | null;
	mem_used_pct: number | null;
	swap_total: number | null;
	swap_used: number | null;
	swap_used_pct: number | null;
	disk_json: string | null;
	// Network: raw uses net_json, hourly uses scalar fields
	net_json: string | null;
	net_rx_bytes_avg: number | null;
	net_rx_bytes_max: number | null;
	net_tx_bytes_avg: number | null;
	net_tx_bytes_max: number | null;
	net_rx_errors: number | null;
	net_tx_errors: number | null;
	uptime_seconds: number | null;
	sample_count?: number; // hourly only
	// Tier 3 fields (nullable — absent from pre-T3 probes)
	psi_cpu_some_avg10: number | null;
	psi_cpu_some_avg60: number | null;
	psi_cpu_some_avg300: number | null;
	psi_mem_some_avg10: number | null;
	psi_mem_some_avg60: number | null;
	psi_mem_some_avg300: number | null;
	psi_mem_full_avg10: number | null;
	psi_mem_full_avg60: number | null;
	psi_mem_full_avg300: number | null;
	psi_io_some_avg10: number | null;
	psi_io_some_avg60: number | null;
	psi_io_some_avg300: number | null;
	psi_io_full_avg10: number | null;
	psi_io_full_avg60: number | null;
	psi_io_full_avg300: number | null;
	disk_io_json: string | null;
	tcp_established: number | null;
	tcp_time_wait: number | null;
	tcp_orphan: number | null;
	tcp_allocated: number | null;
	context_switches_sec: number | null;
	forks_sec: number | null;
	procs_running: number | null;
	procs_blocked: number | null;
	oom_kills: number | null;
	fd_allocated: number | null;
	fd_max: number | null;
	// Signal expansion fields (nullable — absent from pre-v0.6.0 probes)
	interrupts_sec: number | null;
	softirq_net_rx_sec: number | null;
	softirq_block_sec: number | null;
	tasks_running: number | null;
	tasks_total: number | null;
	mem_buffers: number | null;
	mem_cached: number | null;
	mem_dirty: number | null;
	mem_writeback: number | null;
	mem_shmem: number | null;
	mem_slab_reclaimable: number | null;
	mem_slab_unreclaim: number | null;
	mem_committed_as: number | null;
	mem_commit_limit: number | null;
	mem_hw_corrupted: number | null;
	swap_in_sec: number | null;
	swap_out_sec: number | null;
	pgmajfault_sec: number | null;
	pgpgin_sec: number | null;
	pgpgout_sec: number | null;
	psi_cpu_some_total_delta: number | null;
	psi_mem_some_total_delta: number | null;
	psi_mem_full_total_delta: number | null;
	psi_io_some_total_delta: number | null;
	psi_io_full_total_delta: number | null;
	tcp_mem_pages: number | null;
	sockets_used: number | null;
	udp_inuse: number | null;
	udp_mem_pages: number | null;
	snmp_retrans_segs_sec: number | null;
	snmp_active_opens_sec: number | null;
	snmp_passive_opens_sec: number | null;
	snmp_attempt_fails_delta: number | null;
	snmp_estab_resets_delta: number | null;
	snmp_in_errs_delta: number | null;
	snmp_out_rsts_delta: number | null;
	snmp_udp_rcvbuf_errors_delta: number | null;
	snmp_udp_sndbuf_errors_delta: number | null;
	snmp_udp_in_errors_delta: number | null;
	netstat_listen_overflows_delta: number | null;
	netstat_listen_drops_delta: number | null;
	netstat_tcp_timeouts_delta: number | null;
	netstat_tcp_syn_retrans_delta: number | null;
	netstat_tcp_fast_retrans_delta: number | null;
	netstat_tcp_ofo_queue_delta: number | null;
	netstat_tcp_abort_on_memory_delta: number | null;
	netstat_syncookies_sent_delta: number | null;
	softnet_processed_delta: number | null;
	softnet_dropped_delta: number | null;
	softnet_time_squeeze_delta: number | null;
	conntrack_count: number | null;
	conntrack_max: number | null;
}

/** GET /api/alerts → AlertItem[] */
export interface AlertItem {
	hid: string; // opaque hash of host_id for URL routing
	host_id: string;
	hostname: string;
	rule_id: string;
	severity: AlertSeverity;
	value: number | null;
	triggered_at: number; // unix seconds (Worker time)
	message: string | null;
}

// --- Tag types (Dashboard → D1 direct, docs/11-host-tags.md) ---

/** Full tag info — returned by GET /api/tags (management page). */
export interface TagItem {
	id: number;
	name: string;
	color: number; // palette index 0..9
	host_count: number; // populated for tag list
}

/** Lightweight tag reference — embedded in host cards. */
export interface HostTag {
	id: number;
	name: string;
	color: number;
}

/** Tag name constraints: 1-32 chars, lowercase, a-z 0-9 - _ */
export const TAG_NAME_REGEX = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** Maximum tags per host */
export const MAX_TAGS_PER_HOST = 10;

/** Number of color palette slots */
export const TAG_COLOR_COUNT = 10;

// --- Port allowlist types (Dashboard → D1 direct) ---

/** A per-host allowed port entry — returned by GET /api/hosts/:id/allowed-ports. */
export interface AllowedPort {
	port: number;
	reason: string;
	created_at: number;
}

/** Maximum allowed-port entries per host */
export const MAX_ALLOWED_PORTS_PER_HOST = 50;
