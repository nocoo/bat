// @bat/shared — Threshold constants
// Source of truth: docs/03-data-structures.md § Threshold constants

export const ALERT_THRESHOLDS = {
	MEM_HIGH_PCT: 85,
	MEM_HIGH_SWAP_PCT: 50,
	NO_SWAP_MEM_PCT: 70,
	DISK_FULL_PCT: 85,
	IOWAIT_HIGH_PCT: 20,
	STEAL_HIGH_PCT: 10,
	OFFLINE_SECONDS: 120,
	IOWAIT_DURATION_SECONDS: 300,
	STEAL_DURATION_SECONDS: 300,
} as const;

export const RETENTION = {
	RAW_DAYS: 7,
	HOURLY_DAYS: 90,
} as const;

export const INTERVALS = {
	METRICS_SECONDS: 30,
	IDENTITY_HOURS: 6,
	CLOCK_SKEW_MAX_SECONDS: 300,
} as const;

/** Auto-resolution threshold: ranges > 24h use hourly data */
export const AUTO_RESOLUTION_THRESHOLD_SECONDS = 86400;

export const TIER2_THRESHOLDS = {
	UPTIME_ANOMALY_SECONDS: 300,
	CONTAINER_RESTART_COUNT: 5,
	SECURITY_UPDATES_DURATION: 604800, // 7 days
	REBOOT_REQUIRED_DURATION: 604800, // 7 days
} as const;

export const TIER3_THRESHOLDS = {
	PSI_CPU_PCT: 25,
	PSI_MEM_PCT: 10,
	PSI_IO_PCT: 20,
	DISK_IO_UTIL_PCT: 80,
	TCP_TIME_WAIT: 500,
	PSI_DURATION_SECONDS: 300,
	DISK_IO_DURATION_SECONDS: 300,
	TCP_DURATION_SECONDS: 300,
} as const;

export const DEFAULT_PUBLIC_PORT_ALLOWLIST: readonly number[] = [22, 80, 443] as const;
