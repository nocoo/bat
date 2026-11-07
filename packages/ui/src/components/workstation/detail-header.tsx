// The page header: identity and window on the first row, the public address and
// four live readings on the second. One card, two rows, so the first screen is
// data instead of chrome.

import type { WorkstationRecord, WorkstationStatus } from "@bat/shared";
import { Button, SegmentControl } from "@nocoo/basalt";
import { LineChart } from "@nocoo/basalt/charts/line";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { INLINE_SEGMENT } from "@/components/layout/segment";
import { CopyableAddress } from "@/components/workstation/copyable-address";
import { WorkstationStatusBadge } from "@/components/workstation-status-badge";
import { chart } from "@/lib/palette";
import {
	answeringSeries,
	type CapacityPoint,
	medianRttSeries,
	overallRttP95,
	type TargetRow,
} from "@/lib/workstation-detail";
import {
	formatPercent,
	formatRtt,
	formatUptime,
	workstationLastSeen,
} from "@/lib/workstation-format";

const RANGES = [
	{ label: "6h", seconds: 21_600, window: "6 hours" },
	{ label: "24h", seconds: 86_400, window: "24 hours" },
	{ label: "7d", seconds: 604_800, window: "7 days" },
	{ label: "30d", seconds: 2_592_000, window: "30 days" },
] as const;

export function rangeWindowLabel(seconds: number): string {
	return RANGES.find((range) => range.seconds === seconds)?.window ?? "window";
}

function Trend({ points, color }: { points: { x: number; value: number }[]; color: string }) {
	if (points.length < 2) {
		return <span className="hidden h-6 w-14 sm:block" aria-hidden="true" />;
	}
	return (
		<LineChart
			data={points}
			series={[{ key: "value", color }]}
			ariaLabel="Trend"
			className="hidden h-6 w-14 sm:block"
			showAxes={false}
			showLegend={false}
			accessibilityLayer={false}
		/>
	);
}

function Reading({
	label,
	value,
	detail,
	visual,
}: {
	label: string;
	value: string;
	detail: string;
	visual: ReactNode;
}) {
	return (
		<div className="min-w-0 px-basalt-card py-basalt-layout">
			<p className="text-basalt-sm text-basalt-muted-foreground">{label}</p>
			<div className="mt-basalt-space-xs flex items-center justify-between gap-basalt-space-sm">
				<span className="truncate font-mono text-basalt-xl font-semibold tabular-nums">
					{value}
				</span>
				{visual}
			</div>
			<p className="truncate text-basalt-sm text-basalt-muted-foreground">{detail}</p>
		</div>
	);
}

export function DetailHeader({
	record,
	status,
	now,
	rangeSeconds,
	onRangeChange,
	capacity,
	rows,
	actions,
}: {
	record: WorkstationRecord;
	status: WorkstationStatus;
	now: number;
	rangeSeconds: number;
	onRangeChange: (seconds: number) => void;
	capacity: readonly CapacityPoint[];
	rows: readonly TargetRow[];
	actions?: ReactNode;
}) {
	const report = record.latest_report;
	const answering = rows.filter(
		(row) => row.status === "reachable" || row.status === "partial",
	).length;
	const cpuPoints = capacity.map((point) => ({ x: point.x, value: point.cpu ?? 0 }));
	const memPoints = capacity.map((point) => ({ x: point.x, value: point.mem ?? 0 }));
	const system =
		report === null
			? "No report yet"
			: [
					report.hostname,
					report.os,
					report.arch,
					`uptime ${formatUptime(report.uptime_seconds)}`,
				].join(" · ");

	return (
		<LayerCard padding="none">
			<div className="flex flex-wrap items-center justify-between gap-x-basalt-layout gap-y-basalt-space-card-sm px-basalt-card py-basalt-layout">
				<div className="flex min-w-0 items-center gap-basalt-space-md">
					<Button
						asChild={true}
						variant="ghost"
						size="icon"
						className="h-basalt-control-sm min-h-0 w-basalt-control-sm min-w-0"
					>
						<Link to="/workstations" aria-label="Back to workstations">
							<ArrowLeft aria-hidden="true" strokeWidth={1.5} />
						</Link>
					</Button>
					<div className="min-w-0 space-y-basalt-space-md">
						<div className="flex min-w-0 flex-wrap items-center gap-basalt-space-lg">
							<h1 className="text-basalt-3xl font-semibold text-basalt-foreground">
								{record.name}
							</h1>
							<WorkstationStatusBadge status={status} size="md" />
						</div>
						<p className="line-clamp-1 text-basalt-sm text-basalt-muted-foreground">{system}</p>
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-basalt-space-lg">
					<SegmentControl
						legend="History window"
						className={INLINE_SEGMENT}
						value={String(rangeSeconds)}
						onValueChange={(value) => onRangeChange(Number(value))}
						options={RANGES.map(({ label, seconds }) => ({ label, value: String(seconds) }))}
					/>
					{actions}
				</div>
			</div>

			<div className="grid grid-cols-2 divide-basalt-border border-t border-basalt-border sm:grid-cols-3 lg:grid-cols-[minmax(13rem,1.15fr)_repeat(4,minmax(0,1fr))] lg:divide-x">
				<div className="col-span-2 border-b border-basalt-border px-basalt-card py-basalt-layout sm:col-span-3 lg:col-span-1 lg:border-b-0">
					<p className="text-basalt-sm text-basalt-muted-foreground">Public address</p>
					<div className="mt-basalt-space-xs">
						<CopyableAddress value={record.public_ip} />
					</div>
					<p className="mt-basalt-space-xs text-basalt-sm text-basalt-muted-foreground">
						Last seen {workstationLastSeen(record.last_seen_at, now)}
					</p>
				</div>
				<Reading
					label="CPU"
					value={formatPercent(report?.cpu.usage_pct ?? null)}
					detail={report === null ? "No report" : `${report.cpu.count} threads`}
					visual={<Trend points={cpuPoints} color={chart.pink} />}
				/>
				<Reading
					label="Memory"
					value={formatPercent(report?.mem.used_pct ?? null)}
					detail={
						report === null
							? "No report"
							: `${Math.round(report.mem.total_bytes / 1_073_741_824)} GB total`
					}
					visual={<Trend points={memPoints} color={chart.sky} />}
				/>
				<Reading
					label="Reachable"
					value={rows.length === 0 ? "—" : `${answering}/${rows.length}`}
					detail="newest report"
					visual={<Trend points={answeringSeries(rows)} color={chart.green} />}
				/>
				<Reading
					label="RTT p95"
					value={formatRtt(overallRttP95(rows))}
					detail="all targets, window"
					visual={<Trend points={medianRttSeries(rows)} color={chart.orange} />}
				/>
			</div>
		</LayerCard>
	);
}
