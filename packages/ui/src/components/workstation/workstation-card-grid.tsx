// Card view of the workstations page — compact telemetry-dense layout
// matching the Hosts grid anatomy: status + name header, 3-column segmented
// resource bars (CPU / MEM / DISK), 2x3 machine telemetry matrix, 3-column
// server connectivity probe sub-cards, and hostname + last-seen footer.

import type {
	WorkstationConnectivity,
	WorkstationConnectivityStatus,
	WorkstationListItem,
	WorkstationStatus,
} from "@bat/shared";
import { computeWorkstationStatus } from "@bat/shared";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { WorkstationStatusBadge } from "@/components/workstation-status-badge";
import { filledSegments, formatMemoryUsage, getValueColor } from "@/lib/host-card-format";
import { formatCoreCount } from "@/lib/host-spec-format";
import { chart } from "@/lib/palette";
import { cn } from "@/lib/utils";
import {
	connectivityLoss,
	formatLoss,
	formatRtt,
	formatUptime,
	rootDiskUsedPct,
	workstationLastSeen,
} from "@/lib/workstation-format";

const NUMERIC = "font-mono text-basalt-sm tabular-nums";
const SEGMENT_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const MAX_CONNECTIVITY_CARDS = 3;

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

function workstationDotColor(status: WorkstationStatus): string {
	if (status === "recent") {
		return "bg-basalt-success";
	}
	if (status === "stale") {
		return "bg-basalt-warning";
	}
	return "bg-basalt-muted-foreground";
}

function connectivityDotColor(status: WorkstationConnectivityStatus): string {
	if (status === "reachable") {
		return "bg-basalt-success";
	}
	if (status === "partial") {
		return "bg-basalt-warning";
	}
	if (status === "timeout" || status === "unreachable" || status === "error") {
		return "bg-basalt-destructive";
	}
	return "bg-basalt-muted-foreground";
}

function averageRtt(entry: WorkstationConnectivity): number | null {
	const valid = entry.rtts_ms.filter((rtt): rtt is number => rtt !== null && Number.isFinite(rtt));
	if (valid.length === 0) {
		return null;
	}
	return valid.reduce((sum, rtt) => sum + rtt, 0) / valid.length;
}

function shortServerLabel(serverId: string): string {
	return serverId.replace(/^demo-/, "");
}

function reachabilitySummary(connectivity: readonly WorkstationConnectivity[]): string {
	if (connectivity.length === 0) {
		return "—";
	}
	const answering = connectivity.filter(
		(entry) => entry.status === "reachable" || entry.status === "partial",
	).length;
	return `${answering}/${connectivity.length}`;
}

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

function ConnectivitySubCard({ entry }: { entry: WorkstationConnectivity }) {
	const avg = averageRtt(entry);
	const loss = connectivityLoss(entry);
	return (
		<div className="flex min-w-0 flex-col gap-basalt-space-xs rounded-basalt-md border border-basalt-border/70 bg-basalt-muted/30 px-basalt-space-lg py-basalt-space-md">
			<span className="inline-flex min-w-0 items-center gap-1.5 text-basalt-sm font-medium text-basalt-muted-foreground">
				<span
					className={cn("size-1.5 shrink-0 rounded-[1px]", connectivityDotColor(entry.status))}
					aria-hidden="true"
				/>
				<span className="truncate" title={entry.server_id}>
					{shortServerLabel(entry.server_id)}
				</span>
			</span>
			<span className={cn("min-w-0 truncate font-semibold text-basalt-foreground", NUMERIC)}>
				{formatRtt(avg)}
			</span>
			<span
				className={cn(
					"truncate",
					NUMERIC,
					loss !== null && loss > 0 ? "text-basalt-destructive" : "text-basalt-muted-foreground",
				)}
			>
				LOSS {formatLoss(entry)}
			</span>
		</div>
	);
}

export function WorkstationCardGrid({
	records,
	now,
}: {
	records: readonly WorkstationListItem[];
	now: number;
}) {
	return (
		<div
			className="grid auto-rows-fr grid-cols-1 items-stretch gap-basalt-layout md:grid-cols-2 2xl:grid-cols-3"
			data-testid="workstation-card-grid"
		>
			{records.map((record, index) => {
				const status = computeWorkstationStatus(record, now);
				const report = record.latest_report;
				const cpuPct = report?.cpu.usage_pct ?? null;
				const memPct = report?.mem.used_pct ?? null;
				const diskPct = rootDiskUsedPct(report);
				const memUsage = report
					? formatMemoryUsage(report.mem.total_bytes, report.mem.used_pct)
					: null;
				const connectivity = report?.connectivity ?? [];
				const topTargets = connectivity.slice(0, MAX_CONNECTIVITY_CARDS);

				return (
					<LayerCard
						key={record.id}
						className="group relative h-full transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:shadow-md hover:ring-basalt-border motion-reduce:transition-none animate-in fade-in slide-in-from-bottom-2 duration-180 fill-mode-both motion-reduce:animate-none"
						data-testid="workstation-card"
						data-view-enter="true"
						style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
					>
						<Link
							to={`/workstations/${record.id}`}
							className="absolute inset-0 z-20 rounded-basalt-lg"
							aria-label={`Open ${record.name}`}
						/>
						<div className="pointer-events-none relative flex h-full flex-col gap-3">
							{/* Header: status square + workstation name | status badge */}
							<div className="flex min-w-0 items-center gap-basalt-space-lg">
								<span
									className={cn("size-2.5 shrink-0 rounded-[2px]", workstationDotColor(status))}
									aria-hidden="true"
								/>
								<span
									className="min-w-0 truncate text-basalt-base font-semibold tracking-tight text-basalt-foreground"
									title={record.name}
								>
									{record.name}
								</span>
								<span className="ms-auto shrink-0">
									<WorkstationStatusBadge status={status} />
								</span>
							</div>

							{/* 3-column segmented resource bars */}
							<div className="grid grid-cols-3 gap-x-basalt-space-lg gap-y-basalt-space-sm">
								<SegmentedResourceBar
									label="CPU"
									ariaLabel="CPU usage"
									pct={cpuPct}
									seriesColor={chart.sky}
								/>
								<SegmentedResourceBar
									label="MEM"
									ariaLabel="Memory usage"
									pct={memPct}
									seriesColor={chart.green}
								/>
								<SegmentedResourceBar
									label="DISK"
									ariaLabel="Disk usage"
									pct={diskPct}
									seriesColor={chart.amber}
								/>
							</div>

							{/* 2x3 machine telemetry matrix */}
							<div className="grid grid-cols-3 gap-x-basalt-space-lg gap-y-basalt-space-md">
								<TelemetryCell label="PUBLIC IP" value={record.public_ip ?? "—"} />
								<TelemetryCell label="UPTIME" value={formatUptime(report?.uptime_seconds)} />
								<TelemetryCell label="PROBES" value={reachabilitySummary(connectivity)} />
								<TelemetryCell
									label="CPU"
									value={report ? formatCoreCount(report.cpu.count) || "—" : "—"}
								/>
								<TelemetryCell label="MEMORY" value={memUsage ?? "—"} />
								<TelemetryCell label="OS" value={report ? `${report.os} · ${report.arch}` : "—"} />
							</div>

							{/* 3-column server connectivity sub-cards */}
							{topTargets.length > 0 ? (
								<div className="grid grid-cols-3 gap-basalt-space-md">
									{topTargets.map((entry) => (
										<ConnectivitySubCard key={entry.server_id} entry={entry} />
									))}
								</div>
							) : (
								<div className="rounded-basalt-md border border-basalt-border/70 bg-basalt-muted/30 px-basalt-space-lg py-basalt-space-md text-basalt-sm text-basalt-muted-foreground">
									No connectivity probes reported yet
								</div>
							)}

							{/* Footer: reported hostname on left, last-seen age on right */}
							<div className="mt-auto flex min-w-0 items-center justify-between gap-basalt-space-sm border-t border-basalt-border/70 pt-basalt-space-md">
								<span
									className={cn("min-w-0 truncate text-basalt-muted-foreground", NUMERIC)}
									title={report?.hostname}
								>
									{report?.hostname ?? "Not reported"}
								</span>
								<span
									className={cn("shrink-0 whitespace-nowrap text-basalt-muted-foreground", NUMERIC)}
								>
									{workstationLastSeen(record.last_seen_at, now)}
								</span>
							</div>
						</div>
					</LayerCard>
				);
			})}
		</div>
	);
}
