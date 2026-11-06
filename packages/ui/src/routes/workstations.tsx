import type { WorkstationRecord } from "@bat/shared";
import { computeWorkstationStatus } from "@bat/shared";
import { Button } from "@nocoo/basalt";
import { DataTable, type DataTableColumn } from "@nocoo/basalt/components/data-table";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { Laptop, Terminal } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { WorkstationStatusBadge } from "@/components/workstation-status-badge";
import { useWorkstations } from "@/hooks";
import { formatTimestamp } from "@/lib/format";
import {
	formatPercent,
	latestOs,
	rootDiskUsedPct,
	workstationLastSeen,
} from "@/lib/workstation-format";

function columns(now: number): DataTableColumn<WorkstationRecord>[] {
	return [
		{
			id: "name",
			header: "Workstation",
			sortable: false,
			accessor: (record) => (
				<Link
					to={`/workstations/${record.id}`}
					className="font-medium text-basalt-foreground underline-offset-4 hover:underline"
				>
					{record.name}
				</Link>
			),
		},
		{
			id: "os",
			header: "OS",
			sortable: false,
			accessor: (record) =>
				latestOs(record) ?? <span className="text-basalt-muted-foreground">Not reported</span>,
		},
		{
			id: "public_ip",
			header: "Public IP",
			sortable: false,
			accessor: (record) =>
				record.public_ip ? (
					<span className="font-mono">{record.public_ip}</span>
				) : (
					<span className="text-basalt-muted-foreground">Not observed</span>
				),
		},
		{
			id: "cpu",
			header: "CPU",
			sortable: false,
			textAlign: "end",
			accessor: (record) => formatPercent(record.latest_report?.cpu.usage_pct ?? null),
		},
		{
			id: "mem",
			header: "Memory",
			sortable: false,
			textAlign: "end",
			accessor: (record) => formatPercent(record.latest_report?.mem.used_pct ?? null),
		},
		{
			id: "disk",
			header: "Disk /",
			sortable: false,
			textAlign: "end",
			accessor: (record) => formatPercent(rootDiskUsedPct(record.latest_report)),
		},
		{
			id: "last_seen",
			header: "Last seen",
			sortable: false,
			accessor: (record) => (
				<span
					title={
						record.last_seen_at === null
							? "No report has been received"
							: formatTimestamp(record.last_seen_at)
					}
				>
					{workstationLastSeen(record.last_seen_at, now)}
				</span>
			),
		},
		{
			id: "status",
			header: "Status",
			sortable: false,
			accessor: (record) => (
				<WorkstationStatusBadge status={computeWorkstationStatus(record, now)} />
			),
		},
	];
}

function EmptyWorkstations() {
	return (
		<div className="flex flex-col items-center gap-basalt-space-sm py-basalt-layout-lg text-center">
			<Laptop aria-hidden="true" className="size-8 text-basalt-muted-foreground" strokeWidth={1} />
			<p className="font-medium">No workstations enrolled</p>
			<p className="max-w-prose text-basalt-sm text-basalt-muted-foreground">
				Run the bat CLI on your laptop or desktop. The browser consent page links it to your account
				and delivers a dedicated workstation key to that machine.
			</p>
			<Button asChild={true} variant="outline" size="sm" className="mt-basalt-space-sm">
				<Link to="/setup#workstations">
					<Terminal aria-hidden="true" />
					Workstation setup
				</Link>
			</Button>
		</div>
	);
}

export function WorkstationsPage() {
	const { data, error, isLoading, mutate } = useWorkstations();
	const now = Math.floor(Date.now() / 1000);
	const tableColumns = useMemo(() => columns(now), [now]);
	const records = data ?? [];

	return (
		<div className="space-y-basalt-layout" data-testid="workstations-page">
			<PageHeader
				title="Workstations"
				description="Your laptops and desktops, reporting capacity and reachability from outside the fleet."
				actions={
					<Button asChild={true} variant="outline" size="sm">
						<Link to="/setup#workstations">Setup guide</Link>
					</Button>
				}
			/>
			<LayerCard data-testid="workstation-table">
				<DataTable
					aria-label="Workstations"
					edge="attached"
					columns={tableColumns}
					data={records}
					getRowId={(record) => record.id}
					loading={isLoading && data === undefined}
					error={error && data === undefined ? "Could not load workstations." : undefined}
					onRetry={() => void mutate()}
					empty={<EmptyWorkstations />}
				/>
			</LayerCard>
			<p className="text-basalt-sm text-basalt-muted-foreground">
				Stale means no report for more than 30 minutes. It is informational and never raises a fleet
				alert.
			</p>
		</div>
	);
}
