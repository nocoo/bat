// Fleet table for the hosts page: one clean line per column in the UI font
// (tabular numerals keep the columns honest), a lucide anchor on each
// header, and a fixed 40×14 trend slot right of the value so the numbers
// never move. Spec qualifiers and trend slots give way below `xl`; the
// state stays readable from the coloured badge icon and tone-coded
// countdown at every width.

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
import { Fragment } from "react";
import { Link } from "react-router";
import { FleetCostTotal } from "@/components/host/fleet-cost-total";
import { StatusBadge } from "@/components/status-badge";
import { formatCny, renewalToneClass, todayCalendarDate } from "@/lib/billing-format";
import { getValueColor } from "@/lib/host-card-format";
import { formatCoreCount, formatSpecSize } from "@/lib/host-spec-format";
import { chart, getSwatchColor } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/workstation-format";

/** The value of a cell — 14px/500 in the UI font, tabular numerals. Plain
 *  strings, because tailwind-merge cannot tell the custom `text-basalt-*`
 *  size and colour utilities apart and would drop one of them. */
const CELL_VALUE = "whitespace-nowrap text-basalt-base font-medium tabular-nums";
/** The qualifier beside it — 12px muted, wide-view only for machine specs. */
const CELL_SPEC =
	"hidden max-w-28 truncate text-basalt-xs tabular-nums text-basalt-muted-foreground xl:inline";
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
 * Tags share the identity line: colour dots always, names from `xl` up so
 * the hostname stays complete on narrow viewports. Capped at three with a
 * `+N` counter, never pushing the name around.
 */
function TagTrail({ tags }: { tags: readonly HostTag[] }) {
	const visible = tags.slice(0, MAX_VISIBLE_TAGS);
	return (
		<span className="[flex-shrink:100] flex min-w-0 items-center gap-basalt-space-sm overflow-hidden">
			{visible.map((tag, index) => (
				<Fragment key={tag.id}>
					<span
						aria-hidden="true"
						className={cn(
							"size-1.5 shrink-0 rounded-basalt-full",
							index === MAX_VISIBLE_TAGS - 1 && "hidden xl:block",
						)}
						style={{ backgroundColor: getSwatchColor(tag.color) }}
					/>
					<span
						className={cn(
							"hidden min-w-8 max-w-24 truncate text-basalt-xs text-basalt-muted-foreground xl:inline",
						)}
					>
						{tag.name}
					</span>
				</Fragment>
			))}
			{tags.length > 2 && (
				<span className="shrink-0 text-basalt-xs text-basalt-muted-foreground xl:hidden">
					+{tags.length - 2}
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

/** The qualifier of the Link column: quota and reset day in one string,
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
				className="lg:table-fixed lg:[&_th]:px-basalt-space-lg lg:[&_td]:px-basalt-space-lg lg:[&_td]:h-basalt-12"
			>
				<TableHeader>
					<TableRow>
						<TableHead>
							<HeadLabel icon={Server}>Server</HeadLabel>
						</TableHead>
						<TableHead className="lg:w-12 xl:w-24">Status</TableHead>
						<TableHead className="lg:w-17 xl:w-39" textAlign="end">
							<HeadLabel icon={Cpu}>CPU</HeadLabel>
						</TableHead>
						<TableHead className="lg:w-17 xl:w-37" textAlign="end">
							<HeadLabel icon={MemoryStick}>Memory</HeadLabel>
						</TableHead>
						<TableHead className="lg:w-15 xl:w-26" textAlign="end">
							<HeadLabel icon={HardDrive}>Disk</HeadLabel>
						</TableHead>
						<TableHead className="hidden 2xl:table-cell 2xl:w-26" textAlign="end">
							<HeadLabel icon={Activity}>Load 1m</HeadLabel>
						</TableHead>
						<TableHead className="lg:w-18 xl:w-37" textAlign="end">
							<HeadLabel icon={Network}>Link</HeadLabel>
						</TableHead>
						<TableHead className="lg:w-35 2xl:w-41" textAlign="end">
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
						const contract = contractLine(host.traffic_quota_gb, host.traffic_reset_day);
						return (
							<TableRow key={host.host_id} data-testid="host-row">
								<TableCell>
									<div className="flex min-w-0 items-center gap-basalt-space-sm">
										<Link
											to={`/hosts/${hashHostId(host.host_id)}`}
											className="[flex-shrink:0.001] min-w-0 truncate font-medium underline-offset-4 hover:underline"
											title={host.hostname}
										>
											{host.hostname}
										</Link>
										{host.description && (
											<DescriptionHint hostname={host.hostname} description={host.description} />
										)}
										<span
											className={cn(
												"[flex-shrink:100] min-w-0 truncate text-basalt-xs text-basalt-muted-foreground",
												tags.length > 0 && "hidden xl:inline",
											)}
										>
											{[host.os, host.arch].filter(Boolean).join(" · ") || host.host_id}
										</span>
										<TagTrail tags={tags} />
									</div>
								</TableCell>
								<TableCell>
									<StatusBadge status={host.status} responsiveLabel={true} />
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
									className="hidden 2xl:table-cell"
									data-testid="host-load"
								>
									<div className="flex items-center justify-end gap-basalt-space-md">
										{host.cpu_load1 === null ? (
											<span className={`${CELL_VALUE} text-basalt-muted-foreground`}>—</span>
										) : (
											<span className={CELL_VALUE}>{host.cpu_load1.toFixed(2)}</span>
										)}
										<TrendSlot
											points={host.load_sparkline}
											color={chart.teal}
											label={`${host.hostname} 24 hour load`}
										/>
									</div>
								</TableCell>
								<TableCell
									textAlign="end"
									className="whitespace-nowrap"
									data-testid="host-contract"
								>
									<div className="flex items-center justify-end gap-basalt-space-md">
										<span className={CELL_VALUE}>
											{formatBandwidthMbps(host.bandwidth_mbps) ?? "—"}
										</span>
										{contract !== "—" && <span className={CELL_SPEC}>{contract}</span>}
									</div>
								</TableCell>
								<TableCell textAlign="end" className="whitespace-nowrap" data-testid="host-billing">
									{countdown === null && dailyCost === null ? (
										<span className={`${CELL_VALUE} text-basalt-muted-foreground`}>—</span>
									) : (
										<div className="flex items-center justify-end gap-basalt-space-md">
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
