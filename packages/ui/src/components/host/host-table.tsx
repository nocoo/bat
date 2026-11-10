// Fleet table for the hosts page: one clean line per numeric column in the
// UI font (tabular numerals keep the columns honest), a lucide anchor on
// each header, and a fixed 40×14 trend slot right of the value so the
// numbers never move. The identity cell keeps two lines — hostname and
// description icon, then architecture or whole-word tags. Spec qualifiers
// and trend slots give way below `xl`; the state stays readable from the
// coloured badge icon and tone-coded countdown at every width.

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
const CELL_SPEC = "max-w-28 truncate text-basalt-xs tabular-nums text-basalt-muted-foreground";
/** The Link qualifier: bandwidth plus traffic, whole words only — the
 *  reset day folds away below `2xl` and the full string lives in `title`. */
const CELL_LINK_SPEC =
	"hidden shrink-0 whitespace-nowrap text-basalt-xs tabular-nums text-basalt-muted-foreground xl:inline";
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
			className="hidden h-3.5 w-10 shrink-0 items-center justify-center xl:flex"
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

/** The Link cell always keeps its full contract in `title`: the visible
 *  line folds the quota below `xl` and the reset day below `2xl`. */
function contractTitle(
	bandwidthMbps: number | null,
	quotaGb: number | null,
	resetDay: number | null,
): string {
	const parts = [
		formatBandwidthMbps(bandwidthMbps),
		formatTrafficQuotaGb(quotaGb),
		formatResetDayCompact(resetDay),
	].filter((part): part is string => part !== null);
	return parts.length > 0 ? parts.join(" · ") : "—";
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
				className="lg:table-fixed lg:[&_th]:px-basalt-space-lg lg:[&_td]:px-basalt-space-lg lg:[&_td]:h-basalt-12"
			>
				<TableHeader>
					<TableRow>
						<TableHead>
							<HeadLabel icon={Server}>Server</HeadLabel>
						</TableHead>
						<TableHead className="hidden xl:table-cell xl:w-24">
							<HeadLabel icon={Activity}>Status</HeadLabel>
						</TableHead>
						<TableHead className="lg:w-28 xl:w-39" textAlign="end">
							<HeadLabel icon={Cpu}>CPU</HeadLabel>
						</TableHead>
						<TableHead className="lg:w-24 xl:w-37" textAlign="end">
							<HeadLabel icon={MemoryStick}>Memory</HeadLabel>
						</TableHead>
						<TableHead className="lg:w-25 xl:w-26" textAlign="end">
							<HeadLabel icon={HardDrive}>Disk</HeadLabel>
						</TableHead>
						<TableHead className="hidden xl:table-cell xl:w-39 2xl:w-44" textAlign="end">
							<HeadLabel icon={Network}>Link</HeadLabel>
						</TableHead>
						<TableHead className="lg:w-39 2xl:w-44" textAlign="end">
							<HeadLabel icon={Wallet}>Billing</HeadLabel>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody className="[&_tr:not(:last-child)>td]:border-b [&_tr:not(:last-child)>td]:border-basalt-border">
					{hosts.map((host) => {
						const tags = tagsFor(host.host_id) ?? [];
						const daysLeft = daysUntilRenewal(host.renews_at, today);
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
								<TableCell textAlign="end" className="whitespace-nowrap" data-testid="host-disk">
									<div className="flex items-center justify-end gap-basalt-space-md">
										<Pct value={host.disk_root_used_pct} />
										<span className={CELL_SPEC}>{formatSpecSize(host.disk_root_total_bytes)}</span>
									</div>
								</TableCell>
								<TableCell
									textAlign="end"
									className="hidden whitespace-nowrap xl:table-cell"
									data-testid="host-contract"
									title={contractTitle(host.bandwidth_mbps, quota, reset)}
								>
									<div className="flex items-center justify-end gap-basalt-space-md">
										<span className={CELL_VALUE}>
											{formatBandwidthMbps(host.bandwidth_mbps) ?? "—"}
										</span>
										{quota !== null && (
											<span className={CELL_LINK_SPEC}>
												· {formatTrafficQuotaGb(quota)}
												{reset !== null && (
													<span className="hidden 2xl:inline">
														{" "}
														· {formatResetDayCompact(reset)}
													</span>
												)}
											</span>
										)}
									</div>
								</TableCell>
								<TableCell textAlign="end" className="whitespace-nowrap" data-testid="host-billing">
									{countdown === null && dailyCost === null ? (
										<span className={`${CELL_VALUE} text-basalt-muted-foreground`}>—</span>
									) : (
										<div className="flex items-center justify-end gap-basalt-space-lg">
											{dailyCost !== null && (
												<span className={CELL_VALUE} data-testid="host-daily-cost">
													{`${formatCny(dailyCost)}/day`}
												</span>
											)}
											{countdown !== null && (
												<span
													className={`inline-flex items-center gap-basalt-space-xs whitespace-nowrap text-basalt-xs tabular-nums ${renewalToneClass(renewalTone(daysLeft))}`}
													data-testid="host-countdown"
												>
													<Timer
														className="hidden size-3 shrink-0 2xl:block"
														strokeWidth={1.5}
														aria-hidden="true"
													/>
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
					{/* Status and Link only join from `xl`, so the total needs one
					    row per column count to span them all. */}
					<TableRow className="xl:hidden">
						<TableCell
							colSpan={5}
							textAlign="end"
							className="border-t border-basalt-border py-basalt-space-lg"
						>
							<FleetCostTotal hosts={hosts} />
						</TableCell>
					</TableRow>
					<TableRow className="hidden xl:table-row">
						<TableCell
							colSpan={7}
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
