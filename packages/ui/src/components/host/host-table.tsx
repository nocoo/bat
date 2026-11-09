// Fleet table for the hosts page: one dense row per server with the same
// typographic rails the workstation detail uses — monospaced numerals, status
// colour, a 24 hour CPU trend and honest dashes for missing readings.

import type { HostOverviewItem, HostTag } from "@bat/shared";
import { daysUntilRenewal, hashHostId, renewalBadgeLabel, renewalTone } from "@bat/shared";
import { LineChart } from "@nocoo/basalt/charts/line";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@nocoo/basalt/components/table";
import { Link } from "react-router";
import { StatusBadge } from "@/components/status-badge";
import { renewalToneClass, todayCalendarDate } from "@/lib/billing-format";
import { formatLastSeen, getValueColor, statusDotColor } from "@/lib/host-card-format";
import { chart, getSwatchColor } from "@/lib/palette";
import { formatPercent } from "@/lib/workstation-format";

const NUMERIC = "whitespace-nowrap font-mono text-basalt-sm tabular-nums";

function formatBytesPerSecond(value: number | null): string {
	if (value === null || !Number.isFinite(value)) {
		return "—";
	}
	const units = ["B", "KB", "MB", "GB"];
	let scaled = value;
	let unit = 0;
	while (scaled >= 1024 && unit < units.length - 1) {
		scaled /= 1024;
		unit += 1;
	}
	return `${Math.round(scaled * 10) / 10} ${units[unit]}/s`;
}

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
			className="mt-basalt-space-xs h-4 w-16"
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
		return <span className="text-basalt-muted-foreground">—</span>;
	}
	return <span className={pressureClass(value)}>{formatPercent(value)}</span>;
}

export function HostTable({
	hosts,
	tagsFor,
	openPortsFor,
	now,
}: {
	hosts: readonly HostOverviewItem[];
	tagsFor: (hostId: string) => HostTag[] | undefined;
	openPortsFor: (hostId: string) => number;
	now: number;
}) {
	const today = todayCalendarDate(new Date(now * 1000));
	return (
		<div data-basalt-table-container="" data-edge="attached">
			<Table aria-label="Servers">
				<TableHeader>
					<TableRow>
						<TableHead>Server</TableHead>
						<TableHead>Status</TableHead>
						<TableHead textAlign="end">CPU</TableHead>
						<TableHead textAlign="end">Memory</TableHead>
						<TableHead textAlign="end">Disk</TableHead>
						<TableHead textAlign="end">Load 1m</TableHead>
						<TableHead textAlign="end">Net</TableHead>
						<TableHead textAlign="end">Ports</TableHead>
						<TableHead textAlign="end">Last seen</TableHead>
						<TableHead textAlign="end">Expiry</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{hosts.map((host) => {
						const tags = tagsFor(host.host_id) ?? [];
						const daysLeft = daysUntilRenewal(host.renews_at, today);
						const countdown = renewalBadgeLabel(daysLeft);
						return (
							<TableRow key={host.host_id} data-testid="host-row">
								<TableCell>
									<div className="flex min-w-0 items-start gap-basalt-space-md">
										<span
											aria-hidden="true"
											className={`mt-basalt-space-md size-2 shrink-0 rounded-basalt-full ${statusDotColor(host.status)}`}
										/>
										<div className="min-w-0">
											<Link
												to={`/hosts/${hashHostId(host.host_id)}`}
												className="block truncate font-medium underline-offset-4 hover:underline"
												title={host.hostname}
											>
												{host.hostname}
											</Link>
											<span className="flex min-w-0 items-center gap-basalt-space-md text-basalt-sm text-basalt-muted-foreground">
												<span className="truncate">
													{[host.os, host.arch].filter(Boolean).join(" · ") || host.host_id}
												</span>
												{tags.slice(0, 3).map((tag) => (
													<span
														key={tag.id}
														className="flex shrink-0 items-center gap-basalt-space-xs"
													>
														<span
															aria-hidden="true"
															className="size-1.5 rounded-basalt-full"
															style={{ backgroundColor: getSwatchColor(tag.color) }}
														/>
														<span className="truncate">{tag.name}</span>
													</span>
												))}
												{tags.length > 3 && <span>+{tags.length - 3}</span>}
											</span>
										</div>
									</div>
								</TableCell>
								<TableCell>
									<StatusBadge status={host.status} />
								</TableCell>
								<TableCell textAlign="end" className={NUMERIC}>
									<div className="flex flex-col items-end">
										<Pct value={host.cpu_usage_pct} />
										<MiniTrend
											points={host.cpu_sparkline}
											color={chart.pink}
											label={`${host.hostname} 24 hour CPU`}
										/>
									</div>
								</TableCell>
								<TableCell textAlign="end" className={NUMERIC}>
									<div className="flex flex-col items-end">
										<Pct value={host.mem_used_pct} />
										<MiniTrend
											points={host.mem_sparkline}
											color={chart.sky}
											label={`${host.hostname} 24 hour memory`}
										/>
									</div>
								</TableCell>
								<TableCell textAlign="end" className={NUMERIC}>
									<Pct value={host.disk_root_used_pct} />
								</TableCell>
								<TableCell textAlign="end" className={NUMERIC}>
									<div className="flex flex-col items-end">
										{host.cpu_load1 === null ? (
											<span className="text-basalt-muted-foreground">—</span>
										) : (
											(host.cpu_load1 as number).toFixed(2)
										)}
										<MiniTrend
											points={host.load_sparkline}
											color={chart.teal}
											label={`${host.hostname} 24 hour load`}
										/>
									</div>
								</TableCell>
								<TableCell textAlign="end" className={`${NUMERIC} text-basalt-sm`}>
									<span className="text-basalt-muted-foreground">↓</span>{" "}
									{formatBytesPerSecond(host.net_rx_rate)}{" "}
									<span className="text-basalt-muted-foreground">↑</span>{" "}
									{formatBytesPerSecond(host.net_tx_rate)}
								</TableCell>
								<TableCell textAlign="end" className={NUMERIC}>
									{openPortsFor(host.host_id) > 0 ? (
										<span className="text-basalt-warning">{openPortsFor(host.host_id)}</span>
									) : (
										<span className="text-basalt-muted-foreground">—</span>
									)}
								</TableCell>
								<TableCell textAlign="end" className="whitespace-nowrap text-basalt-sm">
									{formatLastSeen(host.last_seen, now)}
									{host.alert_count > 0 && (
										<span className="ms-basalt-space-sm text-basalt-destructive">
											{host.alert_count} alert{host.alert_count === 1 ? "" : "s"}
										</span>
									)}
								</TableCell>
								<TableCell
									textAlign="end"
									className="whitespace-nowrap text-basalt-sm"
									data-testid="host-countdown"
								>
									{countdown && (
										<span className={renewalToneClass(renewalTone(daysLeft))}>{countdown}</span>
									)}
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}
