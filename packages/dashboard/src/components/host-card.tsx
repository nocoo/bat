import { StatusBadge } from "@/components/status-badge";
import { TagChip } from "@/components/tag-chip";
import { Card } from "@/components/ui/card";
import type { HostOverviewItem, HostTag, SparklinePoint } from "@bat/shared";
import { hashHostId } from "@bat/shared";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatUptime(seconds: number | null): string {
	if (seconds === null || seconds <= 0) return "—";
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	if (days > 0) return `${days}d ${hours}h`;
	const minutes = Math.floor((seconds % 3600) / 60);
	return `${hours}h ${minutes}m`;
}

function formatLastSeen(unixSeconds: number): string {
	const now = Math.floor(Date.now() / 1000);
	const delta = now - unixSeconds;
	if (delta < 60) return "just now";
	if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
	if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
	return `${Math.floor(delta / 86400)}d ago`;
}

/** Truncate PRETTY_NAME — "Ubuntu 22.04.3 LTS" → "Ubuntu 22.04" */
function shortenOs(os: string | null): string | null {
	if (!os) return null;
	const match = os.match(/^(\S+)\s+(\d+\.\d+)/);
	return match ? `${match[1]} ${match[2]}` : os;
}

/** Format bytes to human-readable — 8589934592 → "8 GB" */
function formatMemory(bytes: number | null): string | null {
	if (bytes === null) return null;
	const gb = bytes / (1024 * 1024 * 1024);
	if (gb >= 1) return `${Math.round(gb)} GB`;
	const mb = bytes / (1024 * 1024);
	return `${Math.round(mb)} MB`;
}

/** Format CPU topology — "4C/8T" or "4C" if no HT */
function formatCpuTopology(physical: number | null, logical: number | null): string | null {
	if (physical === null && logical === null) return null;
	if (physical !== null && logical !== null && physical !== logical) {
		return `${physical}C/${logical}T`;
	}
	return `${physical ?? logical}C`;
}

/** Format memory as used/total — "4.8 / 8 GB" */
function formatMemoryUsage(totalBytes: number | null, usedPct: number | null): string | null {
	if (totalBytes === null || usedPct === null) return null;
	const totalGb = totalBytes / (1024 * 1024 * 1024);
	const usedGb = (totalGb * usedPct) / 100;
	if (totalGb >= 1) {
		return `${usedGb.toFixed(1)} / ${Math.round(totalGb)} GB`;
	}
	const totalMb = totalBytes / (1024 * 1024);
	const usedMb = (totalMb * usedPct) / 100;
	return `${Math.round(usedMb)} / ${Math.round(totalMb)} MB`;
}

/** Format network rate — bytes/sec → human-readable */
function formatNetRate(bytesPerSec: number | null): string {
	if (bytesPerSec === null) return "—";
	if (bytesPerSec >= 1024 * 1024 * 1024)
		return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
	if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
	if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
	return `${Math.round(bytesPerSec)} B/s`;
}

/** Format disk usage — just percentage string */
function formatDiskUsage(pct: number | null): string {
	if (pct === null) return "—";
	return `${Math.round(pct)}%`;
}

/** Build subtitle: "Ubuntu 22.04 · x86_64 · KVM · 203.0.113.42" */
function buildSubtitle(host: HostOverviewItem): string | null {
	const parts: string[] = [];
	const os = shortenOs(host.os);
	if (os) parts.push(os);
	if (host.arch) parts.push(host.arch);
	if (host.virtualization) parts.push(host.virtualization.toUpperCase());
	if (host.public_ip) parts.push(host.public_ip);
	return parts.length > 0 ? parts.join(" · ") : null;
}

/** Color class for resource bar based on value threshold */
function getBarColor(value: number): string {
	if (value >= 80) return "bg-destructive";
	if (value >= 60) return "bg-warning";
	return "bg-success";
}

/** Text color class matching bar color */
function getValueColor(value: number): string {
	if (value >= 80) return "text-destructive";
	if (value >= 60) return "text-warning";
	return "text-success";
}

// ---------------------------------------------------------------------------
// Status dot color
// ---------------------------------------------------------------------------

function statusDotColor(status: string): string {
	if (status === "healthy") return "bg-success";
	if (status === "warning") return "bg-warning";
	if (status === "critical") return "bg-destructive";
	return "bg-muted-foreground";
}

// ---------------------------------------------------------------------------
// Inline sub-components
// ---------------------------------------------------------------------------

function ResourceBar({
	value,
	label,
	suffix,
}: {
	value: number | null;
	label: string;
	suffix?: string | undefined;
}) {
	const pct = value ?? 0;
	const hasValue = value !== null;
	const valueColorClass = hasValue ? getValueColor(pct) : "text-muted-foreground";
	return (
		<div className="flex items-center gap-2">
			<span className="w-8 text-[11px] font-medium text-muted-foreground shrink-0">{label}</span>
			<div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
				{hasValue && (
					<div
						className={`h-full rounded-full transition-all ${getBarColor(pct)}`}
						style={{ width: `${Math.min(pct, 100)}%` }}
					/>
				)}
			</div>
			<span
				className={`w-8 text-right text-[11px] font-display font-semibold tabular-nums ${valueColorClass}`}
			>
				{hasValue ? `${Math.round(pct)}%` : "—"}
			</span>
			{suffix && (
				<span className="text-[11px] text-muted-foreground truncate max-w-[80px]">{suffix}</span>
			)}
		</div>
	);
}

function MiniBarChart({ data, color }: { data: SparklinePoint[]; color: string }) {
	const barCount = data.length;
	if (barCount === 0) return null;
	const height = 20;

	// Total number of slots to fill the full width (24h at 30min intervals = 48 slots)
	// Use actual data length as the slot count so the chart always fills 100% width
	const totalSlots = barCount;

	// Build a map from data-point index to value for O(1) lookup
	// (currently data fills all slots sequentially, but this is future-proof)
	const values = new Map<number, number>();
	for (let i = 0; i < data.length; i++) {
		const point = data[i];
		if (point) values.set(i, point.v);
	}

	return (
		<svg
			width="100%"
			height={height}
			preserveAspectRatio="none"
			viewBox={`0 0 ${totalSlots} ${height}`}
			className="block"
			role="img"
			aria-label="Sparkline chart"
		>
			{Array.from({ length: totalSlots }, (_, i) => {
				const value = values.get(i);
				if (value != null) {
					const barHeight = Math.max((value / 100) * height, 1);
					const opacity = 0.3 + (value / 100) * 0.7;
					return (
						<rect
							key={`s${i.toString()}`}
							x={i}
							y={height - barHeight}
							width={0.8}
							height={barHeight}
							fill={color}
							opacity={opacity}
						/>
					);
				}
				// No data — render a 1px-tall placeholder to indicate the slot exists
				return (
					<rect
						key={`s${i.toString()}`}
						x={i}
						y={height - 1}
						width={0.8}
						height={1}
						fill={color}
						opacity={0.15}
					/>
				);
			})}
		</svg>
	);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function HostCard({ host, tags }: { host: HostOverviewItem; tags?: HostTag[] | undefined }) {
	const subtitle = buildSubtitle(host);
	const memUsage = formatMemoryUsage(host.mem_total_bytes, host.mem_used_pct);

	return (
		<Link href={`/hosts/${hashHostId(host.host_id)}`}>
			<Card
				className="transition-colors cursor-pointer hover:bg-accent/50 !py-3 !px-3 !gap-0"
				data-testid="host-card"
			>
				{/* Header */}
				<div className="flex items-center justify-between px-0.5">
					<div className="flex items-center gap-1.5 min-w-0">
						<span className={`h-2 w-2 shrink-0 rounded-full ${statusDotColor(host.status)}`} />
						<span className="text-sm font-semibold truncate">{host.hostname}</span>
					</div>
					<StatusBadge status={host.status} />
				</div>
				{subtitle && (
					<p className="text-[11px] text-muted-foreground truncate mt-0.5 px-0.5">{subtitle}</p>
				)}

				{/* Tags */}
				{tags && tags.length > 0 && (
					<div className="flex items-center gap-1 flex-wrap mt-1.5 px-0.5">
						{tags.map((tag) => (
							<TagChip key={tag.id} name={tag.name} color={tag.color} size="sm" />
						))}
					</div>
				)}

				{/* Resource bars */}
				<div className="mt-2.5 space-y-1.5">
					<ResourceBar
						value={host.cpu_usage_pct}
						label="CPU"
						suffix={host.cpu_load1 != null ? `Load ${host.cpu_load1.toFixed(1)}` : undefined}
					/>
					<ResourceBar value={host.mem_used_pct} label="MEM" suffix={memUsage ?? undefined} />
					<ResourceBar
						value={host.swap_used_pct}
						label="SWAP"
						suffix={
							host.disk_root_used_pct != null
								? `Disk / ${formatDiskUsage(host.disk_root_used_pct)}`
								: undefined
						}
					/>
				</div>

				{/* Sparklines — full-width, no labels */}
				{(host.cpu_sparkline || host.mem_sparkline) && (
					<div className="mt-2.5 space-y-1">
						{host.cpu_sparkline && host.cpu_sparkline.length > 0 && (
							<MiniBarChart data={host.cpu_sparkline} color="hsl(var(--chart-1))" />
						)}
						{host.mem_sparkline && host.mem_sparkline.length > 0 && (
							<MiniBarChart data={host.mem_sparkline} color="hsl(var(--chart-2))" />
						)}
					</div>
				)}

				{/* Footer */}
				<div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground px-0.5">
					{host.probe_version && <span>Probe v{host.probe_version}</span>}
					{host.probe_version && <span>·</span>}
					<span>Last seen {formatLastSeen(host.last_seen)}</span>
					<span>·</span>
					<span>Up {formatUptime(host.uptime_seconds)}</span>
				</div>
			</Card>
		</Link>
	);
}

// Export formatters for testing
export {
	formatUptime,
	formatLastSeen,
	shortenOs,
	formatMemory,
	formatCpuTopology,
	formatMemoryUsage,
	formatNetRate,
	formatDiskUsage,
	buildSubtitle,
	getBarColor,
	getValueColor,
};
