// Pure helpers for the per-host alerts card. Severity → tailwind color, plus
// "5m ago" relative time formatting kept out of the View so we can unit-test
// without importing React.

import type { AlertSeverity } from "@bat/shared";

/** Tailwind text color class for a given severity. */
export function severityColorClass(s: AlertSeverity): string {
	switch (s) {
		case "critical":
			return "text-destructive";
		case "warning":
			return "text-warning";
		default:
			return "text-muted-foreground";
	}
}

/** Sort order: critical > warning > info, then most-recent first. */
export function sortAlertsBySeverity<T extends { severity: AlertSeverity; triggered_at: number }>(
	alerts: readonly T[],
): T[] {
	const rank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
	return [...alerts].sort((a, b) => {
		const d = rank[a.severity] - rank[b.severity];
		return d !== 0 ? d : b.triggered_at - a.triggered_at;
	});
}

/**
 * Compact "5m ago" / "2h ago" / "3d ago" string. Returns "just now" for
 * anything under a minute. Future timestamps (clock skew) are clamped to 0.
 */
export function formatRelativeTime(triggeredAt: number, nowSeconds: number): string {
	const diff = Math.max(0, nowSeconds - triggeredAt);
	if (diff < 60) {
		return "just now";
	}
	if (diff < 3600) {
		return `${Math.floor(diff / 60)}m ago`;
	}
	if (diff < 86400) {
		return `${Math.floor(diff / 3600)}h ago`;
	}
	return `${Math.floor(diff / 86400)}d ago`;
}
