import { StatusBadge } from "@/components/status-badge";
import { TagChip } from "@/components/tag-chip";
import { Card } from "@/components/ui/card";
import {
	buildSubtitle,
	formatDiskUsage,
	formatLastSeen,
	formatMemoryUsage,
	formatUptime,
	getBarColor,
	getValueColor,
	statusDotColor,
	toPolyline,
} from "@/lib/host-card-format";
import type { HostOverviewItem, HostTag, SparklinePoint } from "@bat/shared";
import { hashHostId } from "@bat/shared";
import { Link } from "react-router";

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

/** Multi-line sparkline chart: CPU (red), Memory (green), Network (blue) */
function SparklineChart({
	cpu,
	mem,
	net,
}: {
	cpu: SparklinePoint[] | null;
	mem: SparklinePoint[] | null;
	net: SparklinePoint[] | null;
}) {
	const maxLen = Math.max(cpu?.length ?? 0, mem?.length ?? 0, net?.length ?? 0);
	if (maxLen === 0) {
		return null;
	}

	const height = 32;

	return (
		<svg
			width="100%"
			height={height}
			preserveAspectRatio="none"
			viewBox={`0 0 100 ${height}`}
			className="block"
			role="img"
			aria-label="CPU / Memory / Network sparkline"
		>
			{net && net.length > 0 && (
				<polyline
					points={toPolyline(net, net.length, height)}
					fill="none"
					stroke="hsl(var(--chart-2))"
					strokeWidth="1.2"
					strokeLinejoin="round"
					vectorEffect="non-scaling-stroke"
					opacity={0.6}
				/>
			)}
			{mem && mem.length > 0 && (
				<polyline
					points={toPolyline(mem, mem.length, height)}
					fill="none"
					stroke="hsl(var(--success))"
					strokeWidth="1.2"
					strokeLinejoin="round"
					vectorEffect="non-scaling-stroke"
					opacity={0.8}
				/>
			)}
			{cpu && cpu.length > 0 && (
				<polyline
					points={toPolyline(cpu, cpu.length, height)}
					fill="none"
					stroke="hsl(var(--destructive))"
					strokeWidth="1.2"
					strokeLinejoin="round"
					vectorEffect="non-scaling-stroke"
				/>
			)}
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
		<Link to={`/hosts/${hashHostId(host.host_id)}`}>
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

				{/* Sparkline — CPU (red), Memory (green), Network (blue) */}
				{(host.cpu_sparkline || host.mem_sparkline || host.net_sparkline) && (
					<div className="mt-2.5">
						<SparklineChart
							cpu={host.cpu_sparkline}
							mem={host.mem_sparkline}
							net={host.net_sparkline}
						/>
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
