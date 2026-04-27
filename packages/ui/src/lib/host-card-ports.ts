// Pure aggregator for the "open public ports" badge on HostCard.
//
// Lives in `lib/` so the count + threshold logic is unit-testable without
// pulling in React. The HostsPage already polls /api/alerts for its global
// state; we reuse that list (filter by host_id + rule_id) instead of issuing
// per-host tier2 requests, which would be N+1 against the dashboard.

import type { AlertItem } from "@bat/shared";

/**
 * Count active "unexpected public port" alerts for a host. The worker emits
 * one `public_port` alert per port:bind tuple that's listening on a public
 * interface and not on the host's allowlist (see worker/services/alerts.ts).
 */
export function countOpenPublicPorts(
	alerts: readonly AlertItem[] | undefined,
	hostId: string,
): number {
	if (!alerts) {
		return 0;
	}
	let n = 0;
	for (const a of alerts) {
		if (a.host_id === hostId && a.rule_id === "public_port") {
			n++;
		}
	}
	return n;
}
