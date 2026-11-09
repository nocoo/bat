// Card view of the hosts page — the same overview data as the table, laid
// out after the reference dashboard's card anatomy: name + status on the top
// line, price badge and expiry countdown on the second, tag chips, then one
// compact row per metric with a thin usage bar under the ones that have one.
//
// The whole card is one link to the host detail page. The link is a stretched
// overlay above the card; the description affordance (and any other control)
// sits above the overlay with pointer events, so using it never navigates.

import type { HostOverviewItem, HostTag } from "@bat/shared";
import {
	dailyCostCny,
	daysUntilRenewal,
	hashHostId,
	renewalBadgeLabel,
	renewalTone,
} from "@bat/shared";
import { Badge } from "@nocoo/basalt/components/badge";
import { Button } from "@nocoo/basalt/components/button";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nocoo/basalt/components/tooltip";
import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { StatusBadge } from "@/components/status-badge";
import { TagChip } from "@/components/tag-chip";
import { formatCny, renewalToneClass, todayCalendarDate } from "@/lib/billing-format";
import {
	formatMemoryUsage,
	formatNetRate,
	formatUptime,
	getValueColor,
	usageBarFill,
} from "@/lib/host-card-format";
import { formatCoreCount } from "@/lib/host-spec-format";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/workstation-format";

const NUMERIC = "font-mono text-basalt-sm tabular-nums";
const MAX_VISIBLE_TAGS = 3;

/** Only pressure is coloured; a healthy reading stays on the neutral rail. */
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

/** Label on the left, value on the right, the usage bar hugging the line. */
function MetricRow({
	label,
	value,
	pct,
}: {
	label: string;
	value: ReactNode;
	pct?: number | null;
}) {
	return (
		<div className="flex flex-col">
			<div className="flex min-w-0 items-baseline justify-between gap-basalt-space-sm">
				<span className="shrink-0 text-basalt-sm text-basalt-muted-foreground">{label}</span>
				<span className={cn("min-w-0 truncate text-right", NUMERIC)}>{value}</span>
			</div>
			{pct !== undefined && pct !== null && (
				<div
					className="mt-basalt-space-xs h-1 overflow-hidden rounded-basalt-full bg-basalt-muted"
					role="progressbar"
					aria-label={`${label} usage`}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(pct)}
				>
					<div
						className="h-full rounded-basalt-full"
						style={{
							width: `${Math.min(100, Math.max(0, pct))}%`,
							backgroundColor: usageBarFill(pct),
						}}
					/>
				</div>
			)}
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
			className="grid auto-rows-fr grid-cols-1 items-stretch gap-basalt-layout-sm sm:grid-cols-2 2xl:grid-cols-3"
			data-testid="host-card-grid"
		>
			{hosts.map((host) => {
				const tags = tagsFor(host.host_id) ?? [];
				const visibleTags = tags.slice(0, MAX_VISIBLE_TAGS);
				const daysLeft = daysUntilRenewal(host.renews_at, today);
				const countdown = renewalBadgeLabel(daysLeft);
				const dailyCost = dailyCostCny(host.cost_amount_cny, host.paid_at, host.renews_at);
				const memUsage = formatMemoryUsage(host.mem_total_bytes, host.mem_used_pct);
				const diskUsage = formatMemoryUsage(host.disk_root_total_bytes, host.disk_root_used_pct);
				return (
					<LayerCard
						key={host.host_id}
						className="group relative h-full"
						padding="sm"
						data-testid="host-card"
					>
						<Link
							to={`/hosts/${hashHostId(host.host_id)}`}
							className="absolute inset-0 z-20 rounded-basalt-lg"
							aria-label={`Open ${host.hostname}`}
						/>
						<div className="pointer-events-none relative flex h-full flex-col gap-basalt-space-sm">
							<div className="flex min-w-0 items-center gap-basalt-space-xs">
								<span className="min-w-0 truncate font-medium" title={host.hostname}>
									{host.hostname}
								</span>
								{host.description && (
									<DescriptionHint hostname={host.hostname} description={host.description} />
								)}
								<span className="ms-auto shrink-0">
									<StatusBadge status={host.status} />
								</span>
							</div>
							{(dailyCost !== null || countdown !== null) && (
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
								</div>
							)}
							{visibleTags.length > 0 && (
								<div className="flex min-w-0 flex-wrap items-center gap-basalt-space-xs">
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
							<div className="mt-auto grid gap-basalt-space-sm">
								<MetricRow
									label="CPU"
									value={
										<span className={pressureClass(host.cpu_usage_pct)}>
											{host.cpu_usage_pct === null
												? "—"
												: `${formatPercent(host.cpu_usage_pct)} · ${formatCoreCount(host.cpu_logical)}`}
										</span>
									}
									pct={host.cpu_usage_pct}
								/>
								<MetricRow
									label="Memory"
									value={
										<span className={pressureClass(host.mem_used_pct)}>
											{host.mem_used_pct === null
												? "—"
												: `${formatPercent(host.mem_used_pct)}${memUsage ? ` · ${memUsage}` : ""}`}
										</span>
									}
									pct={host.mem_used_pct}
								/>
								<MetricRow
									label="Disk"
									value={
										<span className={pressureClass(host.disk_root_used_pct)}>
											{host.disk_root_used_pct === null
												? "—"
												: `${formatPercent(host.disk_root_used_pct)}${diskUsage ? ` · ${diskUsage}` : ""}`}
										</span>
									}
									pct={host.disk_root_used_pct}
								/>
								<MetricRow
									label="Load 1m"
									value={
										host.cpu_load1 === null ? (
											<span className="text-basalt-muted-foreground">—</span>
										) : (
											host.cpu_load1.toFixed(2)
										)
									}
								/>
								<MetricRow
									label="Net"
									value={`↓ ${formatNetRate(host.net_rx_rate)} · ↑ ${formatNetRate(host.net_tx_rate)}`}
								/>
								<MetricRow label="Uptime" value={formatUptime(host.uptime_seconds)} />
							</div>
						</div>
					</LayerCard>
				);
			})}
		</div>
	);
}
