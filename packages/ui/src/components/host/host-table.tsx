// Fleet table for the hosts page. The table is for scanning, not for reading
// numbers: each metric column carries one visual — a 24 hour trend for CPU and
// memory, a usage bar for disk — and the reading plus the machine's own size
// live in that visual's hover. Traffic and link speed share one column as
// `500 GB @ 100 Mbps`. Columns size to their content and the identity column
// takes whatever is left, so a wide viewport widens the gutters instead of
// squeezing cells against their neighbours. Hover times are the local browser
// clock, `YYYY-MM-DD HH:mm:ss`.

import type { HostOverviewItem, HostTag } from "@bat/shared";
import {
	billingPeriodDays,
	dailyCostCny,
	daysUntilRenewal,
	formatBandwidthMbps,
	formatResetDayLong,
	formatTrafficQuotaGb,
	hashHostId,
	type RenewalTone,
	renewalBadgeLabel,
	renewalTone,
} from "@bat/shared";
import { LineChart } from "@nocoo/basalt/charts/line";
import { ChartTooltipContent, type ChartTooltipItem } from "@nocoo/basalt/charts/tooltip";
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
import {
	Activity,
	Cpu,
	HardDrive,
	Info,
	type LucideIcon,
	MemoryStick,
	Network,
	Server,
	Timer,
	Wallet,
} from "lucide-react";
import { Link } from "react-router";
import { FleetCostTotal } from "@/components/host/fleet-cost-total";
import { hostStatusLabel, StatusBadge } from "@/components/status-badge";
import { formatCny, renewalToneClass, todayCalendarDate } from "@/lib/billing-format";
import { statusDotColor } from "@/lib/host-card-format";
import { formatCoreCount, formatSpecSize } from "@/lib/host-spec-format";
import { chart, getSwatchColor } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/workstation-format";

/** The reading itself — 14px/500, tabular numerals so digits stack column to
 *  column. Plain strings, because tailwind-merge cannot tell the custom
 *  `text-basalt-*` size and colour utilities apart and would drop one of them. */
const CELL_VALUE = "whitespace-nowrap text-basalt-base font-medium tabular-nums";
const MAX_VISIBLE_TAGS = 3;
/** Hover rows reuse the chart tooltip's type: a label and an already
 *  formatted value, so a size never gets run through the numeric formatter. */
const SPARK_SLOT = "ms-auto h-5 w-16 2xl:h-6 2xl:w-24";

/** Local browser clock, the one reference every hover time uses. */
export function localDateTime(seconds: number): string {
	const date = new Date(seconds * 1000);
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function tooltipLabel(label: string | number | undefined): string | undefined {
	if (typeof label === "number") return localDateTime(label);
	return label;
}

/** One header cell: a small muted lucide anchor next to the 12px label.
 *  Decorative only — the text label carries the meaning. */
function HeadLabel({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
	return (
		<span className="inline-flex items-center gap-basalt-space-sm">
			<Icon className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
			{children}
		</span>
	);
}

/** The chart hover: local time on the first line, the point's reading below
 *  it, then whatever the machine's own size is. */
function MetricTooltip({
	active,
	payload,
	label,
	extras,
	formatter,
}: {
	active?: boolean;
	payload?: readonly ChartTooltipItem[];
	label?: string | number;
	extras: readonly { name: string; value: string }[];
	formatter: (value: number) => string;
}) {
	return (
		<ChartTooltipContent
			active={active}
			payload={[...(payload ?? []), ...extras]}
			label={tooltipLabel(label)}
			formatter={formatter}
		/>
	);
}

/** CPU and memory carry their history; the reading only appears on hover. */
function TrendChart({
	points,
	color,
	label,
	extras,
	formatter,
}: {
	points: { ts: number; v: number }[] | null;
	color: string;
	label: string;
	extras: readonly { name: string; value: string }[];
	formatter: (value: number) => string;
}) {
	if (points === null || points.length < 2) {
		return <Dash />;
	}
	return (
		<LineChart
			data={points.map((point) => ({ x: point.ts, value: point.v }))}
			series={[{ key: "value", color }]}
			ariaLabel={label}
			className={SPARK_SLOT}
			showAxes={false}
			showLegend={false}
			accessibilityLayer={false}
			valueFormatter={formatter}
			customTooltip={({ active, payload, label: x }) => (
				<MetricTooltip
					active={active}
					payload={payload}
					label={x}
					extras={extras}
					formatter={formatter}
				/>
			)}
		/>
	);
}

/** A hover panel for the measurements that have no series: local time, the
 *  reading, then the size it was measured against. */
function SnapshotTooltip({
	at,
	headline,
	detail,
}: {
	at: number;
	headline: string;
	detail: string;
}) {
	return (
		<TooltipContent side="top" sideOffset={6} className="text-basalt-sm">
			<div className="flex flex-col gap-basalt-space-xs tabular-nums">
				<span>{localDateTime(at)}</span>
				<span className="text-basalt-muted-foreground">{headline}</span>
				<span className="text-basalt-muted-foreground">{detail}</span>
			</div>
		</TooltipContent>
	);
}

/** A usage bar, 56×4, muted rail. It is the cell's whole visible content, so
 *  the reading lives in the hover rather than beside it. */
function UsageBar({ share, color, testId }: { share: string; color: string; testId: string }) {
	return (
		<span
			aria-hidden="true"
			className="h-1 w-14 shrink-0 overflow-hidden rounded-basalt-full bg-basalt-muted 2xl:w-20"
			data-testid={testId}
		>
			<span
				className="block h-full rounded-basalt-full"
				style={{ width: share, backgroundColor: color }}
			/>
		</span>
	);
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
 * Tags share the subtitle line as dot+name pairs: the first tag is always
 * a full word — a colour dot alone is never an acceptable rendering — and
 * from `xl` up two more join, capped with a `+N` counter that counts what
 * folded. Pairs never shrink; on very long hostnames the name yields last.
 */
function TagTrail({ tags }: { tags: readonly HostTag[] }) {
	const visible = tags.slice(0, MAX_VISIBLE_TAGS);
	return (
		<span className="flex min-w-0 shrink-0 items-center gap-basalt-space-sm">
			{visible.map((tag, index) => (
				<span
					key={tag.id}
					className={
						index > 0
							? "hidden items-center gap-basalt-space-xs xl:flex"
							: "flex items-center gap-basalt-space-xs"
					}
				>
					<span
						aria-hidden="true"
						className="size-1.5 shrink-0 rounded-basalt-full"
						style={{ backgroundColor: getSwatchColor(tag.color) }}
					/>
					<span className="shrink-0 whitespace-nowrap text-basalt-xs text-basalt-muted-foreground">
						{tag.name}
					</span>
				</span>
			))}
			{tags.length > 1 && (
				<span className="shrink-0 text-basalt-xs text-basalt-muted-foreground xl:hidden">
					+{tags.length - 1}
				</span>
			)}
			{tags.length > MAX_VISIBLE_TAGS && (
				<span className="hidden shrink-0 text-basalt-xs text-basalt-muted-foreground xl:inline">
					+{tags.length - MAX_VISIBLE_TAGS}
				</span>
			)}
		</span>
	);
}

/** The empty cell: one muted dash, never a fabricated zero. */
function Dash() {
	return <span className={`${CELL_VALUE} text-basalt-muted-foreground`}>—</span>;
}

function trafficTitle(
	quotaGb: number | null,
	resetDay: number | null,
	bandwidthMbps: number | null,
): string {
	const traffic = formatTrafficQuotaGb(quotaGb);
	const link = formatBandwidthMbps(bandwidthMbps);
	const trafficLine =
		traffic === null
			? "No traffic quota recorded"
			: resetDay === null
				? `${traffic} per month`
				: `${traffic} per month, ${formatResetDayLong(resetDay)}`;
	const linkLine = link === null ? "no link speed recorded" : `${link} bandwidth`;
	return `${trafficLine} · ${linkLine}`;
}

function diskBarColor(usedPct: number): string {
	if (usedPct >= 80) return "hsl(var(--basalt-destructive))";
	if (usedPct >= 60) return "hsl(var(--basalt-warning))";
	return chart.sky;
}

function costTitle(renewsAt: string | null, amount: number | null): string {
	const next = renewsAt === null ? "no renewal date recorded" : `next payment ${renewsAt}`;
	const paid = amount === null ? "amount not recorded" : `${formatCny(amount)} for this period`;
	return `${next} · ${paid}`;
}

function daysLeftTitle(days: number | null, period: number | null): string {
	if (days === null) return "No renewal date recorded";
	const base = days < 0 ? `${-days} days overdue` : days === 0 ? "Due today" : `${days} days left`;
	return period === null ? base : `${base} of ${period} days`;
}

/** The bar is the share of the period already spent, so a full track means
 *  the renewal is due. Overdue stays full. */
function renewalShare(days: number, period: number | null): string {
	// An overdue renewal has no time left on the track, so the bar reads full
	// and red rather than empty — a spent bar must never look calm.
	if (days <= 0) return "100%";
	if (period === null || period <= 0) return "100%";
	const remaining = Math.max(0, Math.min(period, days));
	return `${Math.max(0, Math.min(100, (remaining / period) * 100)).toFixed(1)}%`;
}

function renewalBarColor(tone: RenewalTone): string {
	if (tone === "overdue") return "hsl(var(--basalt-destructive))";
	if (tone === "warning") return "hsl(var(--basalt-warning))";
	return chart.sky;
}

/** `500 GB @ 100 Mbps`, and a sensible reading when one side is missing:
 *  the quota alone, the link speed alone, or one dash for neither. */
function trafficLabel(quotaGb: number | null, bandwidthMbps: number | null): string | null {
	const traffic = formatTrafficQuotaGb(quotaGb);
	const link = formatBandwidthMbps(bandwidthMbps);
	if (traffic === null && link === null) return null;
	if (traffic === null) return link;
	if (link === null) return traffic;
	return `${traffic} @ ${link}`;
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
			<Table aria-label="Servers">
				<TableHeader>
					<TableRow>
						{/* The identity column absorbs the spare width, so it needs a
						    floor to keep a hostname and one tag word readable. */}
						<TableHead className="min-w-[11.5rem]">
							<HeadLabel icon={Server}>Server</HeadLabel>
						</TableHead>
						<TableHead className="hidden w-px xl:table-cell">
							<HeadLabel icon={Activity}>Status</HeadLabel>
						</TableHead>
						<TableHead textAlign="end">
							<HeadLabel icon={Cpu}>CPU</HeadLabel>
						</TableHead>
						<TableHead textAlign="end">
							<HeadLabel icon={MemoryStick}>Memory</HeadLabel>
						</TableHead>
						<TableHead textAlign="end">
							<HeadLabel icon={HardDrive}>Disk</HeadLabel>
						</TableHead>
						<TableHead className="hidden xl:table-cell" textAlign="end">
							<HeadLabel icon={Network}>Traffic / Link</HeadLabel>
						</TableHead>
						<TableHead textAlign="end">
							<HeadLabel icon={Wallet}>Cost</HeadLabel>
						</TableHead>
						<TableHead textAlign="end">
							<HeadLabel icon={Timer}>Days left</HeadLabel>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody className="[&_tr:not(:last-child)>td]:border-b [&_tr:not(:last-child)>td]:border-basalt-border">
					{hosts.map((host) => {
						const tags = tagsFor(host.host_id) ?? [];
						const daysLeft = daysUntilRenewal(host.renews_at, today);
						const periodDays = billingPeriodDays(host.paid_at, host.renews_at);
						const countdown = renewalBadgeLabel(daysLeft);
						const dailyCost = dailyCostCny(host.cost_amount_cny, host.paid_at, host.renews_at);
						const mergedTraffic = trafficLabel(host.traffic_quota_gb, host.bandwidth_mbps);
						const memoryTotal = formatSpecSize(host.mem_total_bytes);
						const memoryUsed =
							host.mem_used_pct === null
								? null
								: formatSpecSize(((host.mem_total_bytes ?? 0) * host.mem_used_pct) / 100);
						const diskTotal = formatSpecSize(host.disk_root_total_bytes);
						const diskUsed =
							host.disk_root_used_pct === null
								? null
								: formatSpecSize(
										((host.disk_root_total_bytes ?? 0) * host.disk_root_used_pct) / 100,
									);
						return (
							<TableRow key={host.host_id} data-testid="host-row">
								<TableCell>
									<div className="flex min-w-0 flex-col gap-basalt-space-xs">
										<div className="flex min-w-0 items-center gap-basalt-space-sm">
											<span
												role="img"
												aria-label={hostStatusLabel(host.status)}
												title={hostStatusLabel(host.status)}
												className={`size-2 shrink-0 rounded-basalt-full xl:hidden ${statusDotColor(host.status)}`}
											/>
											<Link
												to={`/hosts/${hashHostId(host.host_id)}`}
												className="min-w-0 truncate font-medium underline-offset-4 hover:underline"
												title={host.hostname}
											>
												{host.hostname}
											</Link>
											{host.description && (
												<span className="hidden xl:contents">
													<DescriptionHint
														hostname={host.hostname}
														description={host.description}
													/>
												</span>
											)}
										</div>
										<div
											className="flex min-w-0 items-center gap-basalt-space-sm overflow-hidden text-basalt-xs text-basalt-muted-foreground"
											style={{
												minHeight: "calc(var(--basalt-text-xs) * var(--basalt-leading-body))",
											}}
											data-testid="host-subtitle"
										>
											<span
												className={cn(
													"[flex-shrink:100] min-w-0 truncate",
													tags.length > 0 && "hidden",
												)}
											>
												{[host.os, host.arch].filter(Boolean).join(" · ") || host.host_id}
											</span>
											<TagTrail tags={tags} />
										</div>
									</div>
								</TableCell>
								<TableCell className="hidden xl:table-cell">
									<StatusBadge status={host.status} />
								</TableCell>
								<TableCell textAlign="end" data-testid="host-cpu">
									<TrendChart
										points={host.cpu_sparkline}
										color={chart.pink}
										label={
											host.cpu_usage_pct === null
												? `${host.hostname} CPU usage, no reading`
												: `${host.hostname} CPU usage ${formatPercent(host.cpu_usage_pct)}, last 24 hours`
										}
										extras={[{ name: "Cores", value: formatCoreCount(host.cpu_logical) ?? "—" }]}
										formatter={formatPercent}
									/>
								</TableCell>
								<TableCell textAlign="end" data-testid="host-memory">
									<TrendChart
										points={host.mem_sparkline}
										color={chart.sky}
										label={
											host.mem_used_pct === null
												? `${host.hostname} memory usage, no reading`
												: `${host.hostname} memory usage ${formatPercent(host.mem_used_pct)}, last 24 hours`
										}
										extras={[
											{ name: "Used", value: memoryUsed ?? "—" },
											{ name: "Total", value: memoryTotal ?? "—" },
										]}
										formatter={formatPercent}
									/>
								</TableCell>
								<TableCell textAlign="end" data-testid="host-disk">
									{host.disk_root_used_pct === null ? (
										<Dash />
									) : (
										<Tooltip>
											<TooltipTrigger asChild>
												<span className="inline-flex cursor-default">
													<UsageBar
														testId="host-disk-bar"
														share={`${Math.min(100, Math.max(0, host.disk_root_used_pct)).toFixed(1)}%`}
														color={diskBarColor(host.disk_root_used_pct)}
													/>
												</span>
											</TooltipTrigger>
											<SnapshotTooltip
												at={host.last_seen}
												headline={`${formatPercent(host.disk_root_used_pct)} used`}
												detail={
													diskUsed !== null && diskTotal !== null
														? `${diskUsed} of ${diskTotal}`
														: (diskTotal ?? "size unknown")
												}
											/>
										</Tooltip>
									)}
								</TableCell>
								<TableCell
									textAlign="end"
									className="hidden xl:table-cell"
									data-testid="host-traffic"
								>
									{mergedTraffic === null ? (
										<Dash />
									) : (
										<Tooltip>
											<TooltipTrigger asChild>
												<span className={CELL_VALUE}>{mergedTraffic}</span>
											</TooltipTrigger>
											<TooltipContent side="top" sideOffset={6} className="text-basalt-sm">
												{trafficTitle(
													host.traffic_quota_gb,
													host.traffic_reset_day,
													host.bandwidth_mbps,
												)}
											</TooltipContent>
										</Tooltip>
									)}
								</TableCell>
								<TableCell
									textAlign="end"
									data-testid="host-cost"
									title={costTitle(host.renews_at, host.cost_amount_cny)}
								>
									{dailyCost === null ? (
										<Dash />
									) : (
										<Tooltip>
											<TooltipTrigger asChild>
												<span
													className={`${CELL_VALUE} cursor-default`}
													data-testid="host-daily-cost"
												>
													{`${formatCny(dailyCost)}/day`}
												</span>
											</TooltipTrigger>
											<TooltipContent side="top" sideOffset={6}>
												{costTitle(host.renews_at, host.cost_amount_cny)}
											</TooltipContent>
										</Tooltip>
									)}
								</TableCell>
								<TableCell
									textAlign="end"
									data-testid="host-days-left"
									title={daysLeftTitle(daysLeft, periodDays)}
								>
									{daysLeft === null ? (
										<Dash />
									) : (
										<div className="flex items-center justify-end gap-basalt-space-md">
											<span
												data-testid="host-countdown"
												className={`whitespace-nowrap text-basalt-xs tabular-nums ${renewalToneClass(renewalTone(daysLeft))}`}
											>
												{countdown}
											</span>
											<UsageBar
												testId="host-days-bar"
												share={renewalShare(daysLeft, periodDays)}
												color={renewalBarColor(renewalTone(daysLeft))}
											/>
										</div>
									)}
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
				<TableFooter data-testid="host-table-footer">
					{/* Status and the traffic column only join from `xl`, so the
					    total needs one row per column count to span them all. */}
					<TableRow className="xl:hidden">
						<TableCell
							colSpan={6}
							textAlign="end"
							className="border-t border-basalt-border py-basalt-space-lg"
						>
							<FleetCostTotal hosts={hosts} />
						</TableCell>
					</TableRow>
					<TableRow className="hidden xl:table-row">
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
