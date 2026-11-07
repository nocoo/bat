// One dense row per authorized server: identity, address, latest result,
// percentiles and the shape of its history. Numbers stay right-aligned on a
// monospaced rail; a target that never answered keeps em dashes.

import type { WorkstationConnectivityStatus } from "@bat/shared";
import { hashHostId } from "@bat/shared";
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
import type { TargetRow } from "@/lib/workstation-detail";
import { statusColor, statusLabel } from "@/lib/workstation-detail";
import { formatLoss, formatRtt } from "@/lib/workstation-format";

const NUMERIC = "whitespace-nowrap font-mono text-basalt-sm tabular-nums";

function lossClass(loss: number | null): string {
	if (loss === null || loss === 0) {
		return "text-basalt-muted-foreground";
	}
	return loss >= 100 ? "text-basalt-destructive" : "text-basalt-warning";
}

function StatusDot({ status }: { status: WorkstationConnectivityStatus }) {
	return (
		<span className="flex items-center gap-basalt-space-md whitespace-nowrap">
			<span
				aria-hidden="true"
				className="size-2 shrink-0 rounded-basalt-full"
				style={{ backgroundColor: statusColor(status) }}
			/>
			<span className="text-basalt-sm text-basalt-muted-foreground">{statusLabel(status)}</span>
		</span>
	);
}

function Trend({ row }: { row: TargetRow }) {
	const points = row.series
		.filter((point) => point.value !== null)
		.map((point) => ({ x: point.x, value: point.value as number }));
	if (points.length < 2) {
		return (
			<span className="whitespace-nowrap text-basalt-sm text-basalt-muted-foreground">
				{points.length === 0 ? "No samples" : "1 sample"}
			</span>
		);
	}
	return (
		<LineChart
			data={points}
			series={[{ key: "value", color: row.color }]}
			ariaLabel={`${row.name} round-trip time trend`}
			className="h-6 w-24"
			showAxes={false}
			showLegend={false}
			accessibilityLayer={false}
		/>
	);
}

export function TargetTable({ rows }: { rows: readonly TargetRow[] }) {
	return (
		<div data-basalt-table-container="" data-edge="attached">
			<Table aria-label="Reachability targets">
				<TableHeader>
					<TableRow>
						<TableHead>Target</TableHead>
						<TableHead>ICMP</TableHead>
						<TableHead textAlign="end">Last</TableHead>
						<TableHead textAlign="end">P50</TableHead>
						<TableHead textAlign="end">P95</TableHead>
						<TableHead textAlign="end">Loss</TableHead>
						<TableHead>Trend</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<TableRow key={row.serverId}>
							<TableCell>
								<div className="flex min-w-0 items-start gap-basalt-space-md">
									<span
										aria-hidden="true"
										className="mt-basalt-space-md size-2 shrink-0 rounded-basalt-full"
										style={{ backgroundColor: row.color }}
									/>
									<div className="min-w-0">
										<Link
											to={`/hosts/${hashHostId(row.serverId)}`}
											className="block truncate underline-offset-4 hover:underline"
											title={row.name}
										>
											{row.name}
										</Link>
										<span className="flex items-baseline gap-basalt-space-sm font-mono text-basalt-sm text-basalt-muted-foreground">
											{row.address ?? "no address"}
											{row.family !== null && <span>v{row.family}</span>}
										</span>
									</div>
								</div>
							</TableCell>
							<TableCell>
								<StatusDot status={row.status} />
							</TableCell>
							<TableCell textAlign="end" className={NUMERIC}>
								{formatRtt(row.last)}
							</TableCell>
							<TableCell textAlign="end" className={NUMERIC}>
								{formatRtt(row.p50)}
							</TableCell>
							<TableCell textAlign="end" className={NUMERIC}>
								{formatRtt(row.p95)}
							</TableCell>
							<TableCell textAlign="end" className={`${NUMERIC} ${lossClass(row.lossPct)}`}>
								{formatLoss({ status: row.status, sent: row.sent, received: row.received })}
							</TableCell>
							<TableCell>
								<Trend row={row} />
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
