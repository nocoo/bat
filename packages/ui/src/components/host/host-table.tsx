// Fleet table for the hosts page: one fixed rhythm per row — a 14px/500
// primary reading with a 12px muted qualifier under it, 8px cell padding and
// a hairline between rows. Sparklines ride the primary line in a fixed
// 40×14 slot so every numeral keeps one right edge.

import type { HostOverviewItem, HostTag } from "@bat/shared";
import {
	dailyCostCny,
	daysUntilRenewal,
	formatBandwidthMbps,
	formatResetDayCompact,
	formatTrafficQuotaGb,
	hashHostId,
	renewalBadgeLabel,
	renewalTone,
} from "@bat/shared";
import { LineChart } from "@nocoo/basalt/charts/line";
import { Button } from "@nocoo/basalt/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "@nocoo/basalt/components/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nocoo/basalt/components/tooltip";
import { Info } from "lucide-react";
import { Link } from "react-router";
import { FleetCostTotal } from "@/components/host/fleet-cost-total";
import { StatusBadge } from "@/components/status-badge";
import { formatCny, renewalToneClass, todayCalendarDate } from "@/lib/billing-format";
import { getValueColor, statusDotColor } from "@/lib/host-card-format";
import { formatCoreCount, formatSpecSize } from "@/lib/host-spec-format";
import { chart, getSwatchColor } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/workstation-format";

/** The primary reading of a cell — 14px/500, monospaced numerals. Plain
 *  strings, because tailwind-merge cannot tell the custom `text-basalt-*`
 *  size and colour utilities apart and would drop one of them. */
const PRIMARY_VALUE = "whitespace-nowrap font-mono text-basalt-base font-medium tabular-nums";
/** The qualifier under it — 12px, muted unless a tone overrides the colour. */
const SECONDARY_VALUE = "whitespace-nowrap font-mono text-basalt-xs tabular-nums";
const SECONDARY_MUTED = `${SECONDARY_VALUE} text-basalt-muted-foreground`;
/** The two-line stack every metric cell shares: one 2px gap between lines. */
const VALUE_STACK = "flex flex-col items-end gap-basalt-space-xs";
/** The primary line when it carries a sparkline: chart first, value last. */
const VALUE_LINE = "flex items-center justify-end gap-basalt-space-md";
const MAX_VISIBLE_TAGS = 3;
const TAG_NAME_MAX_WIDTH = "max-w-40";

function MiniTrend({
	points,
	color,
	label,
}: {
	points: { ts: number; v: number }[] | null;
	color: string;
	label: string;
}) {
	if (!points || points.length < 2) {
		return null;
	}
	return (
		<LineChart
			data={points.map((point) => ({ x: point.ts, value: point.v }))}
			series={[{ key: "value", color }]}
			ariaLabel={label}
			className="hidden h-3.5 w-10 shrink-0 xl:block"
			showAxes={false}
			showLegend={false}
			accessibilityLayer={false}
		/>
	);
}

/** Only pressure is coloured; a healthy reading stays on the neutral rail. */
function pressureClass(value: number): string {
	return value >= 60 ? getValueColor(value) : "";
}

function Pct({ value }: { value: number | null }) {
	if (value === null) {
		return <span className={`${PRIMARY_VALUE} text-basalt-muted-foreground`}>—</span>;
	}
	return <span className={`${PRIMARY_VALUE} ${pressureClass(value)}`}>{formatPercent(value)}</span>;
}

/** The machine's own size, shown under the utilisation it belongs to. */
function Spec({ value }: { value: string }) {
	return <span className={SECONDARY_MUTED}>{value}</span>;
}

/** Description affordance — a circled `i` that reveals the host description. */
function DescriptionHint({ hostname, description }: { hostname: string; description: string }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="size-4 shrink-0 rounded-basalt-full p-0 text-basalt-muted-foreground hover:text-basalt-foreground"
					aria-label={`Description of ${hostname}`}
					data-testid="host-description"
				>
					<Info className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
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
	);
}

/**
 * Tags stay on the subtitle row: capped, dotted and never pushing the name.
 * The names run one step quieter than the architecture text so the subtitle
 * reads as one line with a foreground head and a muted tail. Wide viewports
 * show three tags; below `xl` the trail narrows to two so every visible name
 * stays readable instead of collapsing to a letter.
 */
function TagTrail({ tags }: { tags: readonly HostTag[] }) {
	const visible = tags.slice(0, MAX_VISIBLE_TAGS);
	return (
		<span className="flex shrink-0 items-center gap-basalt-space-md">
			{visible.map((tag, index) => (
				<span
					key={tag.id}
					className={cn(
						"items-center gap-basalt-space-xs",
						index === MAX_VISIBLE_TAGS - 1 ? "hidden xl:flex" : "flex",
					)}
				>
					<span
						aria-hidden="true"
						className="size-1.5 shrink-0 rounded-basalt-full"
						style={{ backgroundColor: getSwatchColor(tag.color) }}
					/>
					<span className={cn("truncate text-basalt-muted-foreground", TAG_NAME_MAX_WIDTH)}>
						{tag.name}
					</span>
				</span>
			))}
			{tags.length > 2 && (
				<span className="shrink-0 text-basalt-muted-foreground xl:hidden">+{tags.length - 2}</span>
			)}
			{tags.length > MAX_VISIBLE_TAGS && (
				<span className="hidden shrink-0 text-basalt-muted-foreground xl:inline">
					+{tags.length - MAX_VISIBLE_TAGS}
				</span>
			)}
		</span>
	);
}

/** The second line of the Link column: quota and reset day in one string,
 *  or a dash when the host carries neither. */
function contractLine(quotaGb: number | null, resetDay: number | null): string {
	const quota = formatTrafficQuotaGb(quotaGb);
	const reset = formatResetDayCompact(resetDay);
	if (quota && reset) return `${quota} · ${reset}`;
	return quota ?? reset ?? "—";
}

export function HostTable({
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
		<div data-basalt-table-container="" data-edge="attached">
			<Table
				aria-label="Servers"
				className="lg:table-fixed lg:[&_th]:px-basalt-space-lg lg:[&_td]:px-basalt-space-lg"
			>
				<TableHeader>
					<TableRow>
						<TableHead>Server</TableHead>
						<TableHead className="lg:w-21">Status</TableHead>
						<TableHead className="lg:w-17 xl:w-26" textAlign="end">
							CPU
						</TableHead>
						<TableHead className="lg:w-17 xl:w-26" textAlign="end">
							Memory
						</TableHead>
						<TableHead className="lg:w-16" textAlign="end">
							Disk
						</TableHead>
						<TableHead className="hidden 2xl:table-cell 2xl:w-24" textAlign="end">
							Load 1m
						</TableHead>
						<TableHead className="lg:w-21 xl:w-26" textAlign="end">
							Link
						</TableHead>
						<TableHead className="lg:w-26" textAlign="end">
							Billing
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody className="[&_tr:not(:last-child)>td]:border-b [&_tr:not(:last-child)>td]:border-basalt-border">
					{hosts.map((host) => {
						const tags = tagsFor(host.host_id) ?? [];
						const daysLeft = daysUntilRenewal(host.renews_at, today);
						const countdown = renewalBadgeLabel(daysLeft);
						const dailyCost = dailyCostCny(host.cost_amount_cny, host.paid_at, host.renews_at);
						return (
							<TableRow key={host.host_id} data-testid="host-row">
								<TableCell>
									<div className="flex min-w-0 items-start gap-basalt-space-xs">
										<span
											aria-hidden="true"
											className={`mt-basalt-space-md size-2 shrink-0 rounded-basalt-full ${statusDotColor(host.status)}`}
										/>
										<div className="min-w-0 flex-1">
											<div className="flex min-w-0 items-center gap-basalt-space-xs">
												<Link
													to={`/hosts/${hashHostId(host.host_id)}`}
													className="min-w-0 truncate font-medium underline-offset-4 hover:underline"
													title={host.hostname}
												>
													{host.hostname}
												</Link>
												{host.description && (
													<DescriptionHint
														hostname={host.hostname}
														description={host.description}
													/>
												)}
											</div>
											<div className="flex min-w-0 items-center gap-basalt-space-xs overflow-hidden text-basalt-xs">
												<span
													className={cn(
														"min-w-0 truncate text-basalt-foreground",
														tags.length > 0 && "hidden xl:inline",
													)}
												>
													{[host.os, host.arch].filter(Boolean).join(" · ") || host.host_id}
												</span>
												<TagTrail tags={tags} />
											</div>
										</div>
									</div>
								</TableCell>
								<TableCell>
									<StatusBadge status={host.status} />
								</TableCell>
								<TableCell textAlign="end" className="whitespace-nowrap" data-testid="host-cpu">
									<div className={VALUE_STACK}>
										<div className={VALUE_LINE}>
											<MiniTrend
												points={host.cpu_sparkline}
												color={chart.pink}
												label={`${host.hostname} 24 hour CPU`}
											/>
											<Pct value={host.cpu_usage_pct} />
										</div>
										<Spec value={formatCoreCount(host.cpu_logical)} />
									</div>
								</TableCell>
								<TableCell textAlign="end" className="whitespace-nowrap" data-testid="host-memory">
									<div className={VALUE_STACK}>
										<div className={VALUE_LINE}>
											<MiniTrend
												points={host.mem_sparkline}
												color={chart.sky}
												label={`${host.hostname} 24 hour memory`}
											/>
											<Pct value={host.mem_used_pct} />
										</div>
										<Spec value={formatSpecSize(host.mem_total_bytes)} />
									</div>
								</TableCell>
								<TableCell textAlign="end" className="whitespace-nowrap" data-testid="host-disk">
									<div className={VALUE_STACK}>
										<Pct value={host.disk_root_used_pct} />
										<Spec value={formatSpecSize(host.disk_root_total_bytes)} />
									</div>
								</TableCell>
								<TableCell
									textAlign="end"
									className="hidden 2xl:table-cell"
									data-testid="host-load"
								>
									<div className={VALUE_LINE}>
										<MiniTrend
											points={host.load_sparkline}
											color={chart.teal}
											label={`${host.hostname} 24 hour load`}
										/>
										{host.cpu_load1 === null ? (
											<span className={`${PRIMARY_VALUE} text-basalt-muted-foreground`}>—</span>
										) : (
											<span className={PRIMARY_VALUE}>{host.cpu_load1.toFixed(2)}</span>
										)}
									</div>
								</TableCell>
								<TableCell
									textAlign="end"
									className="whitespace-nowrap"
									data-testid="host-contract"
								>
									<div className={VALUE_STACK}>
										<span className={PRIMARY_VALUE}>
											{formatBandwidthMbps(host.bandwidth_mbps) ?? "—"}
										</span>
										{contractLine(host.traffic_quota_gb, host.traffic_reset_day) !== "—" && (
											<span className={`${SECONDARY_MUTED} hidden xl:inline`}>
												{contractLine(host.traffic_quota_gb, host.traffic_reset_day)}
											</span>
										)}
									</div>
								</TableCell>
								<TableCell textAlign="end" className="whitespace-nowrap" data-testid="host-billing">
									{countdown === null && dailyCost === null ? (
										<span className={`${PRIMARY_VALUE} text-basalt-muted-foreground`}>—</span>
									) : (
										<div className={VALUE_STACK}>
											{dailyCost !== null && (
												<span className={PRIMARY_VALUE} data-testid="host-daily-cost">
													{`${formatCny(dailyCost)}/day`}
												</span>
											)}
											{countdown !== null && (
												<span
													className={`${SECONDARY_VALUE} ${renewalToneClass(renewalTone(daysLeft))}`}
													data-testid="host-countdown"
												>
													{countdown}
												</span>
											)}
										</div>
									)}
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
				<TableFooter data-testid="host-table-footer">
					{/* The load column only joins the table at 2xl, so the total
					    needs one row per column count to span them all. */}
					<TableRow className="hidden lg:table-row 2xl:hidden">
						<TableCell
							colSpan={7}
							textAlign="end"
							className="border-t border-basalt-border py-basalt-space-lg"
						>
							<FleetCostTotal hosts={hosts} testId="fleet-cost" />
						</TableCell>
					</TableRow>
					<TableRow className="hidden 2xl:table-row">
						<TableCell
							colSpan={8}
							textAlign="end"
							className="border-t border-basalt-border py-basalt-space-lg"
						>
							<FleetCostTotal hosts={hosts} testId="fleet-cost-wide" />
						</TableCell>
					</TableRow>
				</TableFooter>
			</Table>
		</div>
	);
}
