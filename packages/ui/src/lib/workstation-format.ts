// Pure presentation helpers for workstation records and history. Keeping these
// rules here lets the list/detail views stay thin and makes honest null handling
// (no fabricated 0%) unit-testable.

import type {
	WorkstationConnectivityPoint,
	WorkstationConnectivityStatus,
	WorkstationMetricPoint,
	WorkstationRecord,
	WorkstationStatus,
} from "@bat/shared";
import { WORKSTATION_PING_COUNT } from "@bat/shared";
import { formatLastSeen } from "./host-card-format";

export interface HistorySummary {
	windowLabel: string;
	newestCount: number;
	olderCount: number;
	hasOlderBeyond: boolean;
}

export function formatPercent(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value)) {
		return "—";
	}
	const rounded = Math.round(value * 10) / 10;
	return `${rounded}%`;
}

/** A genuine 0 ms RTT stays visible; only an unavailable probe is null. */
export function formatRtt(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value)) {
		return "—";
	}
	return `${Math.round(value * 10) / 10} ms`;
}

export interface ConnectivityObservation {
	status: WorkstationConnectivityStatus;
	sent: number;
	received: number;
}

/**
 * Local probe failures and unsupported collectors are not network observations,
 * so they must stay gaps. Only an executed probe can report packet loss.
 */
export function connectivityLoss(entry: ConnectivityObservation): number | null {
	if (entry.status === "error" || entry.status === "unsupported") {
		return null;
	}
	if (!Number.isInteger(entry.sent) || entry.sent <= 0) {
		return null;
	}
	const loss = ((entry.sent - entry.received) / entry.sent) * 100;
	return Math.min(100, Math.max(0, loss));
}

export function formatLoss(entry: ConnectivityObservation): string {
	const loss = connectivityLoss(entry);
	return loss === null ? "—" : `${Math.round(loss * 10) / 10}%`;
}

/** History samples carry received counts only; sent is always the shared ping count. */
export function connectivityHistoryLoss(point: WorkstationConnectivityPoint): number | null {
	return connectivityLoss({
		status: point.status,
		sent: WORKSTATION_PING_COUNT,
		received: point.received,
	});
}

export function formatUptime(seconds: number | null | undefined): string {
	if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
		return "—";
	}
	if (seconds < 60) {
		return `${Math.floor(seconds)}s`;
	}
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (days > 0) {
		return `${days}d ${hours}h`;
	}
	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	return `${minutes}m`;
}

export function rootDiskUsedPct(report: WorkstationRecord["latest_report"]): number | null {
	if (!report) {
		return null;
	}
	const root = report.disk.find((disk) => disk.mount === "/") ?? report.disk[0];
	return root?.used_pct ?? null;
}

export function latestOs(record: WorkstationRecord): string | null {
	return record.latest_report?.os ?? null;
}

export function workstationStatusLabel(status: WorkstationStatus): string {
	switch (status) {
		case "recent":
			return "Recent";
		case "stale":
			return "Stale";
		case "disabled":
			return "Disabled";
	}
}

export function workstationLastSeen(lastSeenAt: number | null, nowSeconds?: number): string {
	return lastSeenAt === null ? "Never" : formatLastSeen(lastSeenAt, nowSeconds);
}

export function workstationCollectionErrors(record: WorkstationRecord): string[] {
	return record.latest_report?.collection_errors ?? [];
}

export function mergeMetricPages(
	newest: readonly WorkstationMetricPoint[],
	older: readonly WorkstationMetricPoint[],
): WorkstationMetricPoint[] {
	return [...older, ...newest];
}

export function describeHistory(summary: HistorySummary): { label: string; note: string | null } {
	const loaded = summary.newestCount + summary.olderCount;
	const label = `${summary.windowLabel} · ${loaded} sample${loaded === 1 ? "" : "s"}`;
	if (!summary.hasOlderBeyond) {
		return { label, note: null };
	}
	return {
		label,
		note:
			summary.olderCount > 0
				? `Loaded ${loaded} samples; older samples may remain in this window.`
				: `The newest ${summary.newestCount} samples are loaded. Older samples in this window are not loaded.`,
	};
}
