// @bat/shared — API route constants, request/response types
// Source of truth: docs/03-data-structures.md § Response DTOs + API Route Constants

import type { AlertSeverity } from "./alerts.js";

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
	HOST_TIER2: "/api/hosts/:id/tier2",
	ALERTS: "/api/alerts",
	LIVE: "/api/live",
} as const;

// --- Response DTOs ---

export type HostStatus = "healthy" | "warning" | "critical" | "offline";

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
