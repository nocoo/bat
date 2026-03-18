import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import type { HostOverviewItem, SparklinePoint } from "@bat/shared";
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
			<span className="w-8 text-[10px] font-medium text-muted-foreground shrink-0">{label}</span>
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
				<span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{suffix}</span>
			)}
		</div>
	);
}

function MiniBarChart({ data, color }: { data: SparklinePoint[]; color: string }) {
	const barCount = data.length;
	if (barCount === 0) return null;
	const barWidth = 4;
	const gap = 1;
	const height = 20;
	const svgWidth = barCount * (barWidth + gap) - gap;

	return (
		<svg
			width={svgWidth}
			height={height}
			className="shrink-0"
			role="img"
			aria-label="Sparkline chart"
		>
			{data.map((point, i) => {
				const barHeight = Math.max((point.v / 100) * height, 1);
				// Opacity varies with value: 0.3 at 0%, 1.0 at 100%
				const opacity = 0.3 + (point.v / 100) * 0.7;
				return (
					<rect
						key={point.ts}
						x={i * (barWidth + gap)}
						y={height - barHeight}
						width={barWidth}
						height={barHeight}
						rx={1}
						fill={color}
						opacity={opacity}
					/>
				);
			})}
		</svg>
	);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function HostCard({ host }: { host: HostOverviewItem }) {
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
					<p className="text-[10px] text-muted-foreground truncate mt-0.5 px-0.5">{subtitle}</p>
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

				{/* Sparklines */}
				{(host.cpu_sparkline || host.mem_sparkline) && (
					<div className="mt-2.5 space-y-1.5">
						{host.cpu_sparkline && host.cpu_sparkline.length > 0 && (
							<div className="flex items-center gap-2">
								<span className="w-12 text-[10px] text-muted-foreground shrink-0">CPU 24h</span>
								<MiniBarChart data={host.cpu_sparkline} color="hsl(var(--chart-1))" />
							</div>
						)}
						{host.mem_sparkline && host.mem_sparkline.length > 0 && (
							<div className="flex items-center gap-2">
								<span className="w-12 text-[10px] text-muted-foreground shrink-0">MEM 24h</span>
								<MiniBarChart data={host.mem_sparkline} color="hsl(var(--chart-2))" />
							</div>
						)}
					</div>
				)}

				{/* Footer */}
				<div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-muted-foreground px-0.5">
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
