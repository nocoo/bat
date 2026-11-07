// Fleet table for workstations: one dense row per machine with the same rails
// as the hosts page — status colour, monospaced numerals, a 24 hour trend for
// CPU and memory, and honest dashes when a platform reports nothing.

import type { SparklinePoint, WorkstationListItem } from "@bat/shared";
import { computeWorkstationStatus } from "@bat/shared";
import { LineChart } from "@nocoo/basalt/charts/line";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@nocoo/basalt/components/table";
import { useMemo } from "react";
import { Link } from "react-router";
import { WorkstationStatusBadge } from "@/components/workstation-status-badge";
import { chart } from "@/lib/palette";
import { formatPercent, rootDiskUsedPct, workstationLastSeen } from "@/lib/workstation-format";

const NUMERIC = "whitespace-nowrap font-mono text-basalt-sm tabular-nums";

function MiniTrend({
	points,
	color,
	label,
}: {
	points: SparklinePoint[] | null;
	color: string;
	label: string;
}) {
	if (!points || points.length < 2) {
		return <span className="mt-basalt-space-xs block h-4" aria-hidden="true" />;
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

function Pct({ value }: { value: number | null }) {
	return value === null ? (
		<span className="text-basalt-muted-foreground">—</span>
	) : (
		<span>{formatPercent(value)}</span>
	);
}

function reachability(record: WorkstationListItem): string {
	const connectivity = record.latest_report?.connectivity ?? [];
	if (connectivity.length === 0) {
		return "—";
	}
	const answering = connectivity.filter(
		(entry) => entry.status === "reachable" || entry.status === "partial",
	).length;
	return `${answering}/${connectivity.length}`;
}

export function WorkstationTable({
	records,
	now,
}: {
	records: WorkstationListItem[];
	now: number;
}) {
	const rows = useMemo(
		() => records.map((record) => ({ record, status: computeWorkstationStatus(record, now) })),
		[records, now],
	);

	return (
		<div data-basalt-table-container="" data-edge="attached">
			<Table aria-label="Workstations">
				<TableHeader>
					<TableRow>
						<TableHead>Workstation</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Public IP</TableHead>
						<TableHead textAlign="end">CPU</TableHead>
						<TableHead textAlign="end">Memory</TableHead>
						<TableHead textAlign="end">Disk /</TableHead>
						<TableHead textAlign="end">Reachable</TableHead>
						<TableHead textAlign="end">Last seen</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map(({ record, status }) => (
						<TableRow key={record.id} data-testid="workstation-row">
							<TableCell>
								<div className="min-w-0">
									<Link
										to={`/workstations/${record.id}`}
										className="block truncate font-medium underline-offset-4 hover:underline"
										title={record.name}
									>
										{record.name}
									</Link>
									<span className="flex min-w-0 items-center gap-basalt-space-md text-basalt-sm text-basalt-muted-foreground">
										{record.latest_report === null ? (
											<span>unreported</span>
										) : (
											<>
												<span className="truncate">{record.latest_report.os}</span>
												<span aria-hidden="true">·</span>
												<span className="truncate font-mono">{record.latest_report.hostname}</span>
											</>
										)}
									</span>
								</div>
							</TableCell>
							<TableCell>
								<WorkstationStatusBadge status={status} />
							</TableCell>
							<TableCell>
								{record.public_ip === null ? (
									<span className="text-basalt-sm text-basalt-muted-foreground">Not observed</span>
								) : (
									<span className="whitespace-nowrap font-mono text-basalt-sm">
										{record.public_ip}
									</span>
								)}
							</TableCell>
							<TableCell textAlign="end" className={NUMERIC}>
								<div className="flex flex-col items-end">
									<Pct value={record.latest_report?.cpu.usage_pct ?? null} />
									<MiniTrend
										points={record.cpu_sparkline}
										color={chart.pink}
										label={`${record.name} 24 hour CPU`}
									/>
								</div>
							</TableCell>
							<TableCell textAlign="end" className={NUMERIC}>
								<div className="flex flex-col items-end">
									<Pct value={record.latest_report?.mem.used_pct ?? null} />
									<MiniTrend
										points={record.mem_sparkline}
										color={chart.sky}
										label={`${record.name} 24 hour memory`}
									/>
								</div>
							</TableCell>
							<TableCell textAlign="end" className={NUMERIC}>
								<Pct value={rootDiskUsedPct(record.latest_report)} />
							</TableCell>
							<TableCell textAlign="end" className={NUMERIC}>
								{reachability(record)}
							</TableCell>
							<TableCell textAlign="end" className="whitespace-nowrap text-basalt-sm">
								{workstationLastSeen(record.last_seen_at, now)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
