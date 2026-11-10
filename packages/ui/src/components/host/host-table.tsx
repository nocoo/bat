// Fleet table for the hosts page: one clean line per numeric column in the
// UI font (tabular numerals keep the columns honest), a lucide anchor on
// each header, and a fixed 40×14 trend slot right of the value so the
// numbers never move. The identity cell keeps two lines — hostname and
// description icon, then architecture or whole-word tags. Spec qualifiers
// and trend slots give way below `xl`; the state stays readable from the
// coloured badge icon and tone-coded countdown at every width.

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
import { getValueColor, statusDotColor } from "@/lib/host-card-format";
import { formatCoreCount, formatSpecSize } from "@/lib/host-spec-format";
import { chart, getSwatchColor } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/workstation-format";

/** The value of a cell — 14px/500 in the UI font, tabular numerals. Plain
 *  strings, because tailwind-merge cannot tell the custom `text-basalt-*`
 *  size and colour utilities apart and would drop one of them. */
const CELL_VALUE = "whitespace-nowrap text-basalt-base font-medium tabular-nums";
/** The qualifier beside it — 12px muted, wide-view only for machine specs. */
const CELL_SPEC = "whitespace-nowrap text-basalt-xs tabular-nums text-basalt-muted-foreground";
const MAX_VISIBLE_TAGS = 3;

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

/** The fixed 40×14 trend slot right of the value. The slot is reserved for
 *  every row (empty when the host has no history) so the numerals keep one
 *  right edge, and the whole slot gives way below `xl`. */
function TrendSlot({
	points,
	color,
	label,
}: {
	points: { ts: number; v: number }[] | null;
	color: string;
	label: string;
}) {
	const ready = points !== null && points.length >= 2;
	return (
		<span
			className="hidden h-3.5 w-10 shrink-0 items-center justify-center 2xl:flex"
			aria-hidden={ready ? undefined : true}
		>
			{ready ? (
				<LineChart
					data={points.map((point) => ({ x: point.ts, value: point.v }))}
					series={[{ key: "value", color }]}
					ariaLabel={label}
					className="h-3.5 w-10"
					showAxes={false}
					showLegend={false}
					accessibilityLayer={false}
				/>
			) : null}
		</span>
	);
}

/** Only pressure is coloured; a healthy reading stays on the neutral rail. */
function pressureClass(value: number): string {
	return value >= 60 ? getValueColor(value) : "";
}

function Pct({ value }: { value: number | null }) {
	if (value === null) {
		return <span className={`${CELL_VALUE} text-basalt-muted-foreground`}>—</span>;
	}
	return <span className={`${CELL_VALUE} ${pressureClass(value)}`}>{formatPercent(value)}</span>;
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
 * Tags share the subtitle line: colour dots always, whole names from `xl`
 * up — a tag is never narrower than its full word. Capped at three with a
 * `+N` counter, never pushing the hostname around.
 */
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

function bandwidthTitle(mbps: number | null): string {
	const label = formatBandwidthMbps(mbps);
	return label === null ? "No bandwidth recorded" : `${label} bandwidth`;
}

function trafficTitle(quotaGb: number | null, resetDay: number | null): string {
	const label = formatTrafficQuotaGb(quotaGb);
	if (label === null) return "No traffic quota recorded";
	return resetDay === null
		? `${label} per month`
		: `${label} per month, ${formatResetDayLong(resetDay)}`;
}

function diskTitle(usedPct: number | null, totalBytes: number | null): string {
	if (usedPct === null) return "No disk reading";
	const total = formatSpecSize(totalBytes);
	if (total === null) return `${usedPct.toFixed(1)}% used`;
	const used = formatSpecSize(((totalBytes ?? 0) * usedPct) / 100);
	return `${used} of ${total} used · ${usedPct.toFixed(1)}%`;
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

/** Bandwidth bars are relative to the widest host on screen, so the column
 *  reads as a comparison rather than seven unrelated numbers. */
function bandwidthShare(mbps: number, max: number): string {
	if (!(max > 0) || !(mbps > 0)) return "0%";
	return `${Math.min(100, Math.max(4, (mbps / max) * 100)).toFixed(1)}%`;
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
	const maxBandwidth = hosts.reduce((max, host) => Math.max(max, host.bandwidth_mbps ?? 0), 0);
	return (
		<div data-basalt-table-container="" data-edge="attached">
			<Table
				aria-label="Servers"
				className="lg:table-fixed lg:[&_th]:px-basalt-space-lg lg:[&_td]:px-basalt-space-lg lg:[&_td]:h-basalt-12"
			>
				<TableHeader>
					<TableRow>
						<TableHead>
							<HeadLabel icon={Server}>Server</HeadLabel>
						</TableHead>
						<TableHead className="hidden xl:table-cell xl:w-22">
							<HeadLabel icon={Activity}>Status</HeadLabel>
						</TableHead>
						<TableHead className="lg:w-25 xl:w-32" textAlign="end">
							<HeadLabel icon={Cpu}>CPU</HeadLabel>
						</TableHead>
						<TableHead className="lg:w-24 xl:w-32" textAlign="end">
							<HeadLabel icon={MemoryStick}>Memory</HeadLabel>
						</TableHead>
						<TableHead className="lg:w-26 xl:w-26" textAlign="end">
							<HeadLabel icon={HardDrive}>Disk</HeadLabel>
						</TableHead>
						<TableHead className="hidden xl:table-cell xl:w-24" textAlign="end">
							<HeadLabel icon={Network}>Bandwidth</HeadLabel>
						</TableHead>
						<TableHead className="hidden xl:table-cell xl:w-22" textAlign="end">
							<HeadLabel icon={HardDrive}>Traffic</HeadLabel>
						</TableHead>
						<TableHead className="lg:w-22 xl:w-26" textAlign="end">
							<HeadLabel icon={Wallet}>Cost</HeadLabel>
						</TableHead>
						<TableHead className="lg:w-24 xl:w-32" textAlign="end">
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
						const quota = host.traffic_quota_gb;
						const reset = host.traffic_reset_day;
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
												className="[flex-shrink:0.001] min-w-0 truncate font-medium underline-offset-4 hover:underline"
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
								<TableCell textAlign="end" className="whitespace-nowrap" data-testid="host-cpu">
									<div className="flex items-center justify-end gap-basalt-space-md">
										<Pct value={host.cpu_usage_pct} />
										<span className={CELL_SPEC}>{formatCoreCount(host.cpu_logical)}</span>
										<TrendSlot
											points={host.cpu_sparkline}
											color={chart.pink}
											label={`${host.hostname} 24 hour CPU`}
										/>
									</div>
								</TableCell>
								<TableCell textAlign="end" className="whitespace-nowrap" data-testid="host-memory">
									<div className="flex items-center justify-end gap-basalt-space-md">
										<Pct value={host.mem_used_pct} />
										<span className={CELL_SPEC}>{formatSpecSize(host.mem_total_bytes)}</span>
										<TrendSlot
											points={host.mem_sparkline}
											color={chart.sky}
											label={`${host.hostname} 24 hour memory`}
										/>
									</div>
								</TableCell>
								<TableCell
									textAlign="end"
									className="whitespace-nowrap"
									data-testid="host-disk"
									title={diskTitle(host.disk_root_used_pct, host.disk_root_total_bytes)}
								>
									{host.disk_root_used_pct === null ? (
										<Dash />
									) : (
										<Tooltip>
											<TooltipTrigger asChild>
												<div className="flex cursor-default items-center justify-end gap-basalt-space-md">
													<span
														aria-hidden="true"
														className="h-1 w-8 shrink-0 overflow-hidden rounded-basalt-full bg-basalt-muted"
														data-testid="host-disk-bar"
													>
														<span
															className="block h-full rounded-basalt-full"
															style={{
																width: `${Math.min(100, Math.max(0, host.disk_root_used_pct)).toFixed(1)}%`,
																backgroundColor: diskBarColor(host.disk_root_used_pct),
															}}
														/>
													</span>
													<span
														data-testid="host-disk-pct"
														className={`${CELL_VALUE} ${pressureClass(host.disk_root_used_pct)}`}
													>
														{formatPercent(host.disk_root_used_pct)}
													</span>
												</div>
											</TooltipTrigger>
											<TooltipContent side="top" sideOffset={6}>
												{diskTitle(host.disk_root_used_pct, host.disk_root_total_bytes)}
											</TooltipContent>
										</Tooltip>
									)}
								</TableCell>
								<TableCell
									textAlign="end"
									className="hidden whitespace-nowrap xl:table-cell"
									data-testid="host-bandwidth"
									title={bandwidthTitle(host.bandwidth_mbps)}
								>
									{host.bandwidth_mbps === null ? (
										<Dash />
									) : (
										<div className="flex items-center justify-end gap-basalt-space-md">
											<span
												aria-hidden="true"
												className="h-1 w-7 shrink-0 overflow-hidden rounded-basalt-full bg-basalt-muted"
												data-testid="host-bandwidth-bar"
											>
												<span
													className="block h-full rounded-basalt-full"
													style={{
														width: bandwidthShare(host.bandwidth_mbps, maxBandwidth),
														backgroundColor: chart.sky,
													}}
												/>
											</span>
											<span className={CELL_SPEC}>{formatBandwidthMbps(host.bandwidth_mbps)}</span>
										</div>
									)}
								</TableCell>
								<TableCell
									textAlign="end"
									className="hidden whitespace-nowrap xl:table-cell"
									data-testid="host-traffic"
									title={trafficTitle(quota, reset)}
								>
									{quota === null ? (
										<Dash />
									) : (
										<Tooltip>
											<TooltipTrigger asChild>
												<span className={`${CELL_VALUE} cursor-default`}>
													{formatTrafficQuotaGb(quota)}
												</span>
											</TooltipTrigger>
											<TooltipContent side="top" sideOffset={6}>
												{reset === null
													? `${formatTrafficQuotaGb(quota)} per month`
													: `${formatTrafficQuotaGb(quota)} per month, ${formatResetDayLong(reset)}`}
											</TooltipContent>
										</Tooltip>
									)}
								</TableCell>
								<TableCell
									textAlign="end"
									className="whitespace-nowrap"
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
									className="whitespace-nowrap"
									data-testid="host-days-left"
									title={daysLeftTitle(daysLeft, periodDays)}
								>
									{daysLeft === null ? (
										<Dash />
									) : (
										<div className="flex items-center justify-end gap-basalt-space-md">
											<span
												aria-hidden="true"
												className="h-1 w-8 shrink-0 overflow-hidden rounded-basalt-full bg-basalt-muted"
												data-testid="host-days-bar"
											>
												<span
													className="block h-full rounded-basalt-full"
													style={{
														width: renewalShare(daysLeft, periodDays),
														backgroundColor: renewalBarColor(renewalTone(daysLeft)),
													}}
												/>
											</span>
											<span
												data-testid="host-countdown"
												className={`w-18 shrink-0 text-right text-basalt-xs tabular-nums ${renewalToneClass(renewalTone(daysLeft))}`}
											>
												{countdown}
											</span>
										</div>
									)}
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
				<TableFooter data-testid="host-table-footer">
					{/* Status and Link only join from `xl`, so the total needs one
					    row per column count to span them all. */}
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
							colSpan={9}
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
