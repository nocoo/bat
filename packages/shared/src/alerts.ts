// @bat/shared — Alert types and Tier-1 rules
// Source of truth: docs/03-data-structures.md § Alert Rules

import { ALERT_THRESHOLDS, SIGNAL_EXPANSION_THRESHOLDS, TIER3_THRESHOLDS } from "./constants.js";

export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertRule {
	id: string;
	label: string;
	severity: AlertSeverity;
	duration_seconds: number; // 0 = instant, 300 = 5 min
}

export interface AlertState {
	host_id: string;
	rule_id: string;
	severity: AlertSeverity;
	value: number;
	triggered_at: number; // Worker time (unix seconds)
	message: string;
}

export type HealthStatus = "healthy" | "degraded" | "critical" | "empty";

export interface HealthResponse {
	status: HealthStatus;
	version: string;
	total_hosts: number;
	healthy: number;
	warning: number;
	critical: number;
	checked_at: number;
}

/**
 * 6 Tier-1 alert rules for MVP.
 * - Instant rules: fire immediately when threshold exceeded
 * - Duration rules: require sustained breach for `duration_seconds`
 * - host_offline: evaluated at query time, not during ingest
 */
export const TIER1_ALERT_RULES: readonly AlertRule[] = [
	{
		id: "mem_high",
		label: "High Memory Usage",
		severity: "critical",
		duration_seconds: 0,
	},
	{
		id: "no_swap",
		label: "No Swap Available",
		severity: "critical",
		duration_seconds: 0,
	},
	{
		id: "disk_full",
		label: "Disk Full",
		severity: "critical",
		duration_seconds: 0,
	},
	{
		id: "iowait_high",
		label: "High IO Wait",
		severity: "warning",
		duration_seconds: ALERT_THRESHOLDS.IOWAIT_DURATION_SECONDS,
	},
	{
		id: "steal_high",
		label: "CPU Steal",
		severity: "warning",
		duration_seconds: ALERT_THRESHOLDS.STEAL_DURATION_SECONDS,
	},
	{
		id: "host_offline",
		label: "Host Offline",
		severity: "critical",
		duration_seconds: 0, // evaluated at query time
	},
] as const;

/**
 * 9 Tier-2 alert rules for post-MVP.
 * Evaluated during /api/tier2 ingest.
 */
export const TIER2_ALERT_RULES: readonly AlertRule[] = [
	{
		id: "uptime_anomaly",
		label: "Recent Reboot",
		severity: "info",
		duration_seconds: 0,
	},
	{
		id: "ssh_password_auth",
		label: "SSH Password Auth",
		severity: "critical",
		duration_seconds: 0,
	},
	{
		id: "ssh_root_login",
		label: "SSH Root Login",
		severity: "critical",
		duration_seconds: 0,
	},
	{
		id: "no_firewall",
		label: "No Firewall",
		severity: "critical",
		duration_seconds: 0,
	},
	{
		id: "public_port",
		label: "Unexpected Public Port",
		severity: "warning",
		duration_seconds: 0,
	},
	{
		id: "security_updates",
		label: "Security Updates Pending",
		severity: "warning",
		duration_seconds: 604800, // 7 days
	},
	{
		id: "container_restart",
		label: "Container Restarting",
		severity: "critical",
		duration_seconds: 0,
	},
	{
		id: "systemd_failed",
		label: "Systemd Unit Failed",
		severity: "warning",
		duration_seconds: 0,
	},
	{
		id: "reboot_required",
		label: "Reboot Required",
		severity: "info",
		duration_seconds: 604800, // 7 days
	},
] as const;

/**
 * 6 Tier-3 alert rules for procfs-native signals.
 * Evaluated during /api/ingest (same as Tier 1).
 */
export const TIER3_ALERT_RULES: readonly AlertRule[] = [
	{
		id: "cpu_pressure",
		label: "CPU Pressure",
		severity: "warning",
		duration_seconds: TIER3_THRESHOLDS.PSI_DURATION_SECONDS,
	},
	{
		id: "mem_pressure",
		label: "Memory Pressure",
		severity: "warning",
		duration_seconds: TIER3_THRESHOLDS.PSI_DURATION_SECONDS,
	},
	{
		id: "io_pressure",
		label: "I/O Pressure",
		severity: "warning",
		duration_seconds: TIER3_THRESHOLDS.PSI_DURATION_SECONDS,
	},
	{
		id: "disk_io_saturated",
		label: "Disk I/O Saturated",
		severity: "warning",
		duration_seconds: TIER3_THRESHOLDS.DISK_IO_DURATION_SECONDS,
	},
	{
		id: "tcp_conn_leak",
		label: "TCP Connection Leak",
		severity: "warning",
		duration_seconds: TIER3_THRESHOLDS.TCP_DURATION_SECONDS,
	},
	{
		id: "oom_kill",
		label: "OOM Kill",
		severity: "critical",
		duration_seconds: 0, // instant
	},
] as const;

/**
 * 9 Signal-expansion alert rules.
 * Evaluated during /api/ingest (same as Tier 1/3).
 */
export const SIGNAL_EXPANSION_ALERT_RULES: readonly AlertRule[] = [
	{
		id: "tcp_retrans_high",
		label: "TCP Retransmissions",
		severity: "warning",
		duration_seconds: SIGNAL_EXPANSION_THRESHOLDS.SIGNAL_EXPANSION_DURATION_SECONDS,
	},
	{
		id: "listen_drops",
		label: "Listen Queue Drops",
		severity: "critical",
		duration_seconds: 0,
	},
	{
		id: "inode_full",
		label: "Inode Usage Full",
		severity: "critical",
		duration_seconds: 0,
	},
	{
		id: "swap_active",
		label: "Active Swapping",
		severity: "warning",
		duration_seconds: SIGNAL_EXPANSION_THRESHOLDS.SIGNAL_EXPANSION_DURATION_SECONDS,
	},
	{
		id: "hw_corrupted",
		label: "Hardware Memory Corruption",
		severity: "critical",
		duration_seconds: 0,
	},
	{
		id: "overcommit_high",
		label: "Memory Overcommit",
		severity: "warning",
		duration_seconds: 0,
	},
	{
		id: "conntrack_full",
		label: "Conntrack Table Full",
		severity: "critical",
		duration_seconds: 0,
	},
	{
		id: "softnet_drops",
		label: "Softnet Packet Drops",
		severity: "warning",
		duration_seconds: 0,
	},
	{
		id: "disk_latency_high",
		label: "High Disk Latency",
		severity: "warning",
		duration_seconds: SIGNAL_EXPANSION_THRESHOLDS.SIGNAL_EXPANSION_DURATION_SECONDS,
	},
] as const;

/** All alert rules (Tier 1 + Tier 2 + Tier 3 + Signal Expansion) */
export const ALL_ALERT_RULES: readonly AlertRule[] = [
	...TIER1_ALERT_RULES,
	...TIER2_ALERT_RULES,
	...TIER3_ALERT_RULES,
	...SIGNAL_EXPANSION_ALERT_RULES,
] as const;

/** Lookup a rule by ID across all tiers */
export function getAlertRule(ruleId: string): AlertRule | undefined {
	return ALL_ALERT_RULES.find((r) => r.id === ruleId);
}

/** Get human-readable label for a rule ID, falls back to raw rule_id */
export function getAlertRuleLabel(ruleId: string): string {
	return getAlertRule(ruleId)?.label ?? ruleId;
}
