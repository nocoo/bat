// @bat/shared — Alert types and Tier-1 rules
// Source of truth: docs/03-data-structures.md § Alert Rules

import { ALERT_THRESHOLDS } from "./constants.js";

export type AlertSeverity = "warning" | "critical";

export interface AlertRule {
	id: string;
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
		severity: "critical",
		duration_seconds: 0,
	},
	{
		id: "no_swap",
		severity: "critical",
		duration_seconds: 0,
	},
	{
		id: "disk_full",
		severity: "critical",
		duration_seconds: 0,
	},
	{
		id: "iowait_high",
		severity: "warning",
		duration_seconds: ALERT_THRESHOLDS.IOWAIT_DURATION_SECONDS,
	},
	{
		id: "steal_high",
		severity: "warning",
		duration_seconds: ALERT_THRESHOLDS.STEAL_DURATION_SECONDS,
	},
	{
		id: "host_offline",
		severity: "critical",
		duration_seconds: 0, // evaluated at query time
	},
] as const;

/** Lookup a rule by ID */
export function getAlertRule(ruleId: string): AlertRule | undefined {
	return TIER1_ALERT_RULES.find((r) => r.id === ruleId);
}
