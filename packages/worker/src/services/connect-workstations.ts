// Connect workstation read shaping.
//
// A workstation grant authorizes the snapshot, but per-server observations are
// additionally limited to the key's effective server grants. A workstation-only
// key therefore sees capacity data and an empty connectivity list, and a mixed
// key never sees another server's status, address or count. Opaque CLI error
// strings are dropped entirely: they can name unauthorized servers or addresses.

import type { WorkstationConnectivityHistory, WorkstationRecord } from "@bat/shared";

export function redactWorkstationRecord(
	record: WorkstationRecord,
	authorizedServerIds: ReadonlySet<string>,
): WorkstationRecord {
	const report = record.latest_report;
	if (report === null) return record;
	return {
		...record,
		latest_report: {
			...report,
			connectivity: report.connectivity.filter((entry) => authorizedServerIds.has(entry.server_id)),
			collection_errors: [],
			targets_error: null,
		},
	};
}

export function filterConnectivityHistory(
	targets: WorkstationConnectivityHistory[],
	authorizedServerIds: ReadonlySet<string>,
): WorkstationConnectivityHistory[] {
	return targets.filter((target) => authorizedServerIds.has(target.server_id));
}
