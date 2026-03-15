// @bat/shared — API route constants, request/response types
// Source of truth: docs/03-data-structures.md § Response DTOs + API Route Constants

import type { AlertSeverity } from "./alerts.js";

// --- Route constants ---

export const API_ROUTES = {
	INGEST: "/api/ingest",
	IDENTITY: "/api/identity",
	HOSTS: "/api/hosts",
	HOST_METRICS: "/api/hosts/:id/metrics",
	ALERTS: "/api/alerts",
	HEALTH: "/api/health",
} as const;

// --- Response DTOs ---

export type HostStatus = "healthy" | "warning" | "critical" | "offline";

/** GET /api/hosts → HostOverviewItem[] */
export interface HostOverviewItem {
	host_id: string;
	hostname: string;
	os: string | null;
	kernel: string | null;
	arch: string | null;
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
}

/** GET /api/alerts → AlertItem[] */
export interface AlertItem {
	host_id: string;
	hostname: string;
	rule_id: string;
	severity: AlertSeverity;
	value: number | null;
	triggered_at: number; // unix seconds (Worker time)
	message: string | null;
}
