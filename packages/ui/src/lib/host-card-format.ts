// Pure formatting + theming helpers for the HostCard view.
//
// Lives in `lib/` (not in the component file) so the rules can be unit-tested
// without rendering React, and so the View stays presentation-only (MVVM).
import type { HostOverviewItem, SparklinePoint } from "@bat/shared";

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/** Compact uptime string used on the host card: "2d 3h" / "1h 5m" / "—". */
export function formatUptime(seconds: number | null): string {
	if (seconds === null || seconds <= 0) {
		return "—";
	}
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	if (days > 0) {
		return `${days}d ${hours}h`;
	}
	const minutes = Math.floor((seconds % 3600) / 60);
	return `${hours}h ${minutes}m`;
}

/**
 * Relative "last seen" string, e.g. "just now", "5m ago", "2h ago", "3d ago".
 * `nowSeconds` is injectable for tests; defaults to wall clock.
 */
export function formatLastSeen(unixSeconds: number, nowSeconds?: number): string {
	const now = nowSeconds ?? Math.floor(Date.now() / 1000);
	const delta = now - unixSeconds;
	if (delta < 60) {
		return "just now";
	}
	if (delta < 3600) {
		return `${Math.floor(delta / 60)}m ago`;
	}
	if (delta < 86400) {
		return `${Math.floor(delta / 3600)}h ago`;
	}
	return `${Math.floor(delta / 86400)}d ago`;
}

/** Truncate PRETTY_NAME — "Ubuntu 22.04.3 LTS" → "Ubuntu 22.04". */
export function shortenOs(os: string | null): string | null {
	if (!os) {
		return null;
	}
	const match = os.match(/^(\S+)\s+(\d+\.\d+)/);
	return match ? `${match[1]} ${match[2]}` : os;
}

/** Format bytes as "8 GB" / "512 MB". */
export function formatMemory(bytes: number | null): string | null {
	if (bytes === null) {
		return null;
	}
	const gb = bytes / (1024 * 1024 * 1024);
	if (gb >= 1) {
		return `${Math.round(gb)} GB`;
	}
	const mb = bytes / (1024 * 1024);
	return `${Math.round(mb)} MB`;
}

/** Format CPU topology — "4C/8T" or "4C" if no HT. */
export function formatCpuTopology(physical: number | null, logical: number | null): string | null {
	if (physical === null && logical === null) {
		return null;
	}
	if (physical !== null && logical !== null && physical !== logical) {
		return `${physical}C/${logical}T`;
	}
	return `${physical ?? logical}C`;
}

/** Format used/total memory — "4.8 / 8 GB" (or MB for sub-GB systems). */
export function formatMemoryUsage(
	totalBytes: number | null,
	usedPct: number | null,
): string | null {
	if (totalBytes === null || usedPct === null) {
		return null;
	}
	const totalGb = totalBytes / (1024 * 1024 * 1024);
	const usedGb = (totalGb * usedPct) / 100;
	if (totalGb >= 1) {
		return `${usedGb.toFixed(1)} / ${Math.round(totalGb)} GB`;
	}
	const totalMb = totalBytes / (1024 * 1024);
	const usedMb = (totalMb * usedPct) / 100;
	return `${Math.round(usedMb)} / ${Math.round(totalMb)} MB`;
}

/** Format network rate — bytes/sec → "1.2 MB/s" / "—". */
export function formatNetRate(bytesPerSec: number | null): string {
	if (bytesPerSec === null) {
		return "—";
	}
	if (bytesPerSec >= 1024 * 1024 * 1024) {
		return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
	}
	if (bytesPerSec >= 1024 * 1024) {
		return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
	}
	if (bytesPerSec >= 1024) {
		return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
	}
	return `${Math.round(bytesPerSec)} B/s`;
}

/** Disk usage percentage display — "47%" or "—". */
export function formatDiskUsage(pct: number | null): string {
	return pct === null ? "—" : `${Math.round(pct)}%`;
}

/** Build host-card subtitle: "Ubuntu 22.04 · x86_64 · KVM · 203.0.113.42". */
export function buildSubtitle(host: HostOverviewItem): string | null {
	const parts: string[] = [];
	const os = shortenOs(host.os);
	if (os) {
		parts.push(os);
	}
	if (host.arch) {
		parts.push(host.arch);
	}
	if (host.virtualization) {
		parts.push(host.virtualization.toUpperCase());
	}
	if (host.public_ip) {
		parts.push(host.public_ip);
	}
	return parts.length > 0 ? parts.join(" · ") : null;
}

// ---------------------------------------------------------------------------
// Theming
// ---------------------------------------------------------------------------

/** Tailwind bg class for a 0–100 resource value (success / warning / destructive). */
export function getBarColor(value: number): string {
	if (value >= 80) {
		return "bg-destructive";
	}
	if (value >= 60) {
		return "bg-warning";
	}
	return "bg-success";
}

/** Tailwind text class matching {@link getBarColor}. */
export function getValueColor(value: number): string {
	if (value >= 80) {
		return "text-destructive";
	}
	if (value >= 60) {
		return "text-warning";
	}
	return "text-success";
}

/** Tailwind bg class for the status dot. */
export function statusDotColor(status: string): string {
	if (status === "healthy") {
		return "bg-success";
	}
	if (status === "warning") {
		return "bg-warning";
	}
	if (status === "critical") {
		return "bg-destructive";
	}
	return "bg-muted-foreground";
}

// ---------------------------------------------------------------------------
// Sparkline geometry
// ---------------------------------------------------------------------------

/**
 * Build an SVG polyline `points` string from sparkline data.
 * Maps the value range 0–100 to `height`–0 (top of viewport is high value).
 * `totalSlots` lets the caller align multiple sparklines on the same x-axis.
 */
export function toPolyline(data: SparklinePoint[], totalSlots: number, height: number): string {
	if (data.length === 0) {
		return "";
	}
	return data
		.map((p, i) => {
			const x = totalSlots > 1 ? (i / (totalSlots - 1)) * 100 : 50;
			const y = height - (p.v / 100) * height;
			return `${x},${y}`;
		})
		.join(" ");
}
