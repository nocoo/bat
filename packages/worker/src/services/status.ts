// Status derivation — shared by hosts list and health endpoint
import type { HostStatus } from "@bat/shared";
import { ALERT_THRESHOLDS } from "@bat/shared";

interface AlertRow {
	severity: string;
	rule_id?: string;
	message?: string | null;
}

/** Parse port numbers from a public_port alert message. */
function parsePublicPorts(message: string | null | undefined): number[] {
	if (!message) return [];
	const match = message.match(/Unexpected public ports:\s*(.+)/);
	if (!match?.[1]) return [];
	return match[1]
		.split(",")
		.map((s) => Number(s.trim()))
		.filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * Derive host status from last_seen time and active alerts.
 * Priority: offline > critical > warning > healthy
 *
 * When `allowedPorts` is provided, a public_port warning whose ports are
 * ALL in the allowed set is treated as info (does not count as warning).
 */
export function deriveHostStatus(
	lastSeen: number,
	now: number,
	alerts: AlertRow[],
	allowedPorts?: Set<number>,
): HostStatus {
	// Offline if not seen within threshold
	if (now - lastSeen > ALERT_THRESHOLDS.OFFLINE_SECONDS) {
		return "offline";
	}

	// Check alert severities
	const hasCritical = alerts.some((a) => a.severity === "critical");
	if (hasCritical) return "critical";

	const hasWarning = alerts.some((a) => {
		if (a.severity !== "warning") return false;
		// If this is a public_port alert and we have an allowlist, check if
		// all ports in the message are allowed — if so, skip this warning.
		if (a.rule_id === "public_port" && allowedPorts && allowedPorts.size > 0) {
			const ports = parsePublicPorts(a.message);
			if (ports.length > 0 && ports.every((p) => allowedPorts.has(p))) {
				return false;
			}
		}
		return true;
	});
	if (hasWarning) return "warning";

	return "healthy";
}
