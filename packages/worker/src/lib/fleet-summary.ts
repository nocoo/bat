// Pure helper: summarise a list of per-host statuses into fleet-level counts
// + an overall health verdict. Extracted from fleet-status.ts so the routing\n// code stays thin and this logic is unit-tested directly.
import type { HostStatus } from "@bat/shared";

export interface FleetSummary {
	healthy: number;
	warning: number;
	critical: number;
	maintenance: number;
	overall: "healthy" | "degraded" | "critical";
}

/**
 * Count how many hosts fall into each bucket and derive the overall verdict.
 * "offline" hosts are folded into `critical` because the fleet-health API
 * reports them as critical. Unknown statuses are ignored.
 */
export function summarizeHostStatuses(statuses: HostStatus[]): FleetSummary {
	let healthy = 0;
	let warning = 0;
	let critical = 0;
	let maintenance = 0;

	for (const status of statuses) {
		switch (status) {
			case "healthy":
				healthy++;
				break;
			case "warning":
				warning++;
				break;
			case "critical":
			case "offline":
				critical++;
				break;
			case "maintenance":
				maintenance++;
				break;
			default:
				break;
		}
	}

	let overall: FleetSummary["overall"];
	if (critical > 0) {
		overall = "critical";
	} else if (warning > 0) {
		overall = "degraded";
	} else {
		overall = "healthy";
	}

	return { healthy, warning, critical, maintenance, overall };
}
