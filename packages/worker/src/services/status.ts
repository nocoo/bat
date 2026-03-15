// Status derivation — shared by hosts list and health endpoint
import type { HostStatus } from "@bat/shared";
import { ALERT_THRESHOLDS } from "@bat/shared";

interface AlertRow {
	severity: string;
}

/**
 * Derive host status from last_seen time and active alerts.
 * Priority: offline > critical > warning > healthy
 */
export function deriveHostStatus(
	lastSeen: number,
	now: number,
	alerts: AlertRow[],
): HostStatus {
	// Offline if not seen within threshold
	if (now - lastSeen > ALERT_THRESHOLDS.OFFLINE_SECONDS) {
		return "offline";
	}

	// Check alert severities
	const hasCritical = alerts.some((a) => a.severity === "critical");
	if (hasCritical) return "critical";

	const hasWarning = alerts.some((a) => a.severity === "warning");
	if (hasWarning) return "warning";

	return "healthy";
}
