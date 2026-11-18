// Card view of the hosts page — compact telemetry-dense layout inspired by
// the reference VPS grid: status + hostname + uptime/status header, 4-column
// segmented resource bars (CPU / MEM / DISK / SWAP), 2x3 telemetry & contract
// matrix, 3-column hardware/capacity sub-cards, tags, and billing + last-seen footer.
//
// The whole card is one link to the host detail page. The link is a stretched
// overlay above the card; the description affordance sits above the overlay
// with pointer events, so using it never navigates.

import type { HostOverviewItem, HostTag } from "@bat/shared";
import {
	dailyCostCny,
	daysUntilRenewal,
	formatBandwidthMbps,
	formatMonthlyTrafficGb,
	formatResetDayCompact,
	hashHostId,
	renewalBadgeLabel,
	renewalTone,
} from "@bat/shared";
import { Badge } from "@nocoo/basalt/components/badge";
import { Button } from "@nocoo/basalt/components/button";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nocoo/basalt/components/tooltip";
import { Info } from "@nocoo/basalt/icons";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { StatusBadge } from "@/components/status-badge";
import { TagChip } from "@/components/tag-chip";
import { formatCny, renewalToneClass, todayCalendarDate } from "@/lib/billing-format";
import {
	filledSegments,
	formatLastSeen,
	formatMemoryUsage,
	formatNetRate,
	formatUptime,
	getValueColor,
	statusDotColor,
} from "@/lib/host-card-format";
import { formatCoreCount } from "@/lib/host-spec-format";
import { chart } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/workstation-format";

const NUMERIC = "font-mono text-basalt-sm tabular-nums";
const MAX_VISIBLE_TAGS = 3;
const SEGMENT_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

function segmentFill(pct: number | null, seriesColor: string): string {
	if (pct !== null && pct >= 80) {
		return "hsl(var(--basalt-destructive))";
	}
	if (pct !== null && pct >= 60) {
		return "hsl(var(--basalt-warning))";
	}
	return seriesColor;
}

function pressureClass(value: number | null): string {
	return value !== null && value >= 60 ? getValueColor(value) : "";
}

/** The card's own description affordance — sits above the link overlay. */
function DescriptionHint({ hostname, description }: { hostname: string; description: string }) {
	return (
		<span className="pointer-events-auto relative z-30">
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className="size-5 shrink-0 rounded-basalt-full p-0 text-basalt-muted-foreground hover:text-basalt-foreground"
						aria-label={`Description of ${hostname}`}
						data-testid="host-description"
					>
						<Info className="size-4" strokeWidth={1.5} aria-hidden="true" />
					</Button>
				</TooltipTrigger>
				<TooltipContent
					side="top"
					sideOffset={6}
					className="max-w-64 whitespace-pre-wrap break-words text-basalt-sm"
				>
					{description}
				</TooltipContent>
			</Tooltip>
		</span>
	);
}

/** Compact segmented resource bar (label + pct on top, 10 discrete blocks below). */
function SegmentedResourceBar({
	label,
	ariaLabel,
	pct,
	seriesColor,
}: {
	label: string;
	ariaLabel: string;
	pct: number | null;
	seriesColor: string;
}) {
	const litCount = filledSegments(pct, SEGMENT_INDICES.length);
	const fill = segmentFill(pct, seriesColor);
	return (
		<div className="flex min-w-0 flex-col gap-basalt-space-xs">
			<div className="flex min-w-0 items-center justify-between gap-1">
				<span className="inline-flex min-w-0 items-center gap-1 text-basalt-sm font-medium text-basalt-muted-foreground">
					<span
						className="size-1.5 shrink-0 rounded-[1px]"
						style={{ backgroundColor: seriesColor }}
						aria-hidden="true"
					/>
					<span className="truncate">{label}</span>
				</span>
				<span
					className={cn("shrink-0 font-semibold", NUMERIC, pressureClass(pct))}
					style={pct !== null && pct < 60 ? { color: seriesColor } : undefined}
				>
					{pct === null ? "—" : `${Math.round(pct)}%`}
				</span>
			</div>
			<div
				className="flex gap-[2px]"
				role="progressbar"
				aria-label={ariaLabel}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={pct === null ? undefined : Math.round(pct)}
			>
				{SEGMENT_INDICES.map((idx) => (
					<span
						key={idx}
						className="h-1.5 flex-1 rounded-[1px] bg-basalt-muted"
						style={idx < litCount ? { backgroundColor: fill } : undefined}
					/>
				))}
			</div>
		</div>
	);
}

/** Single cell in the 2x3 compact telemetry matrix. */
function TelemetryCell({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="flex min-w-0 flex-col">
			<span className="truncate text-basalt-sm font-medium tracking-wide text-basalt-muted-foreground">
				{label}
			</span>
			<span className={cn("min-w-0 truncate font-medium text-basalt-foreground", NUMERIC)}>
				{value}
			</span>
		</div>
	);
}

/** Framed sub-card in the 3-column capacity/spec strip. */
function SpecSubCard({
	label,
	primary,
	secondary,
	accentColor,
}: {
	label: string;
	primary: string;
	secondary: string;
	accentColor: string;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-basalt-space-xs rounded-basalt-md border border-basalt-border/70 bg-basalt-muted/30 px-basalt-space-lg py-basalt-space-md">
			<span className="inline-flex min-w-0 items-center gap-1.5 text-basalt-sm font-medium text-basalt-muted-foreground">
				<span
					className="size-1.5 shrink-0 rounded-[1px]"
					style={{ backgroundColor: accentColor }}
					aria-hidden="true"
				/>
				<span className="truncate">{label}</span>
			</span>
			<span className={cn("min-w-0 truncate font-semibold text-basalt-foreground", NUMERIC)}>
				{primary}
			</span>
			<span className={cn("truncate text-basalt-muted-foreground", NUMERIC)}>{secondary}</span>
		</div>
	);
}

export function HostCardGrid({
	hosts,
	tagsFor,
	now,
}: {
	hosts: readonly HostOverviewItem[];
	tagsFor: (hostId: string) => HostTag[] | undefined;
	now: number;
}) {
	const today = todayCalendarDate(new Date(now * 1000));
	return (
		<div
			className="grid auto-rows-fr grid-cols-1 items-stretch gap-basalt-layout md:grid-cols-2 2xl:grid-cols-3"
			data-testid="host-card-grid"
		>
			{hosts.map((host, index) => {
				const tags = tagsFor(host.host_id) ?? [];
				const visibleTags = tags.slice(0, MAX_VISIBLE_TAGS);
				const daysLeft = daysUntilRenewal(host.renews_at, today);
				const countdown = renewalBadgeLabel(daysLeft);
				const dailyCost = dailyCostCny(host.cost_amount_cny, host.paid_at, host.renews_at);
				const memUsage = formatMemoryUsage(host.mem_total_bytes, host.mem_used_pct);
				const diskUsage = formatMemoryUsage(host.disk_root_total_bytes, host.disk_root_used_pct);
				const uptime = formatUptime(host.uptime_seconds);
				return (
					<LayerCard
						key={host.host_id}
						className="group relative h-full transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:shadow-md hover:ring-basalt-border motion-reduce:transition-none animate-fade-up motion-reduce:animate-none"
						data-testid="host-card"
						data-view-enter="true"
						style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
					>
						<Link
							to={`/hosts/${hashHostId(host.host_id)}`}
							className="absolute inset-0 z-20 rounded-basalt-lg"
							aria-label={`Open ${host.hostname}`}
						/>
						<div className="pointer-events-none relative flex h-full flex-col gap-3">
							{/* Header: status square + hostname + description hint | status badge */}
							<div className="flex min-w-0 items-center gap-basalt-space-lg">
								<span
									className={cn("size-2.5 shrink-0 rounded-[2px]", statusDotColor(host.status))}
									aria-hidden="true"
								/>
								<span
									className="min-w-0 truncate text-basalt-base font-semibold tracking-tight text-basalt-foreground"
									title={host.hostname}
								>
									{host.hostname}
								</span>
								{host.description && (
									<DescriptionHint hostname={host.hostname} description={host.description} />
								)}
								<span className="ms-auto shrink-0">
									<StatusBadge status={host.status} />
								</span>
							</div>

							{/* 4-column segmented resource bars */}
							<div className="grid grid-cols-2 gap-x-basalt-space-md gap-y-basalt-space-sm sm:grid-cols-4">
								<SegmentedResourceBar
									label="CPU"
									ariaLabel="CPU usage"
									pct={host.cpu_usage_pct}
									seriesColor={chart.sky}
								/>
								<SegmentedResourceBar
									label="MEM"
									ariaLabel="Memory usage"
									pct={host.mem_used_pct}
									seriesColor={chart.green}
								/>
								<SegmentedResourceBar
									label="DISK"
									ariaLabel="Disk usage"
									pct={host.disk_root_used_pct}
									seriesColor={chart.amber}
								/>
								<SegmentedResourceBar
									label="SWAP"
									ariaLabel="Swap usage"
									pct={host.swap_used_pct}
									seriesColor={chart.pink}
								/>
							</div>

							{/* 2x3 telemetry & contract matrix */}
							<div className="grid grid-cols-3 gap-x-basalt-space-lg gap-y-basalt-space-md">
								<TelemetryCell
									label="NET"
									value={
										host.net_rx_rate === null && host.net_tx_rate === null ? (
											<span className="text-basalt-muted-foreground">—</span>
										) : (
											<span className="inline-flex items-center gap-1.5">
												<span style={{ color: chart.green }}>
													↑{formatNetRate(host.net_tx_rate)}
												</span>
												<span style={{ color: chart.sky }}>↓{formatNetRate(host.net_rx_rate)}</span>
											</span>
										)
									}
								/>
								<TelemetryCell
									label="LOAD 1M"
									value={
										host.cpu_load1 === null ? (
											<span className="text-basalt-muted-foreground">—</span>
										) : (
											host.cpu_load1.toFixed(2)
										)
									}
								/>
								<TelemetryCell label="UPTIME" value={uptime} />
								<TelemetryCell
									label="BANDWIDTH"
									value={formatBandwidthMbps(host.bandwidth_mbps) ?? "—"}
								/>
								<TelemetryCell
									label="TRAFFIC"
									value={formatMonthlyTrafficGb(host.traffic_quota_gb) ?? "—"}
								/>
								<TelemetryCell
									label="RESET"
									value={formatResetDayCompact(host.traffic_reset_day) ?? "—"}
								/>
							</div>

							{/* 3-column framed capacity sub-cards */}
							<div className="grid grid-cols-3 gap-basalt-space-md">
								<SpecSubCard
									label="CPU"
									primary={formatCoreCount(host.cpu_logical) || "—"}
									secondary={host.arch ?? "—"}
									accentColor={chart.sky}
								/>
								<SpecSubCard
									label="MEM"
									primary={memUsage ?? "—"}
									secondary={
										host.swap_used_pct === null
											? "SWAP —"
											: `SWAP ${formatPercent(host.swap_used_pct)}`
									}
									accentColor={chart.green}
								/>
								<SpecSubCard
									label="DISK"
									primary={diskUsage ?? "—"}
									secondary={host.os ? host.os.split(" ")[0] : "ROOT /"}
									accentColor={chart.amber}
								/>
							</div>

							{/* Optional tags */}
							{visibleTags.length > 0 && (
								<div className="flex min-w-0 flex-wrap items-center gap-basalt-space-sm">
									{visibleTags.map((tag) => (
										<TagChip key={tag.id} name={tag.name} color={tag.color} />
									))}
									{tags.length > MAX_VISIBLE_TAGS && (
										<span className="text-basalt-sm text-basalt-muted-foreground">
											+{tags.length - MAX_VISIBLE_TAGS}
										</span>
									)}
								</div>
							)}

							{/* Footer: billing + countdown + active alerts on left, last-seen age on right */}
							<div className="mt-auto flex min-w-0 items-center justify-between gap-basalt-space-sm border-t border-basalt-border/70 pt-basalt-space-md">
								<div className="flex min-w-0 flex-wrap items-center gap-basalt-space-sm">
									{dailyCost !== null && (
										<Badge variant="secondary" className={NUMERIC}>
											{formatCny(dailyCost)}/day
										</Badge>
									)}
									{countdown !== null && (
										<span
											className={cn(
												"text-basalt-sm whitespace-nowrap",
												renewalToneClass(renewalTone(daysLeft)),
											)}
											data-testid="host-countdown"
										>
											{countdown}
										</span>
									)}
									{dailyCost === null && countdown === null && (
										<span className="text-basalt-sm text-basalt-muted-foreground">No billing</span>
									)}
									{host.alert_count > 0 && (
										<Badge variant="destructive" className={NUMERIC}>
											{host.alert_count} active
										</Badge>
									)}
								</div>
								<span
									className={cn("shrink-0 whitespace-nowrap text-basalt-muted-foreground", NUMERIC)}
								>
									{formatLastSeen(host.last_seen, now)}
								</span>
							</div>
						</div>
					</LayerCard>
				);
			})}
		</div>
	);
}
