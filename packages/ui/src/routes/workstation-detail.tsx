import type {
	WorkstationConnectivity,
	WorkstationConnectivityStatus,
	WorkstationRecord,
} from "@bat/shared";
import { computeWorkstationStatus, hashHostId } from "@bat/shared";
import { Button, SegmentControl } from "@nocoo/basalt";
import { DataTable, type DataTableColumn } from "@nocoo/basalt/components/data-table";
import { DescriptionList } from "@nocoo/basalt/components/description-list";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { TagBadge, type TagColor } from "@nocoo/basalt/components/tag-badge";
import { AlertTriangle, ArrowLeft, Info, Network } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError } from "@/api";
import { INLINE_SEGMENT } from "@/components/layout/segment";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkstationDeleteDialog } from "@/components/workstation-delete-dialog";
import { WorkstationHistory } from "@/components/workstation-history";
import { WorkstationStatusBadge } from "@/components/workstation-status-badge";
import {
	useHosts,
	useWorkstation,
	useWorkstationConnectivity,
	useWorkstationMetricsPages,
} from "@/hooks";
import { formatTimestamp } from "@/lib/format";
import { formatMemory } from "@/lib/host-card-format";
import {
	connectivityRows,
	connectivityWindowLabel,
	describeHistory,
	formatLoss,
	formatPercent,
	formatRtt,
	formatUptime,
	rootDiskUsedPct,
	rttAverage,
	workstationCollectionErrors,
	workstationLastSeen,
} from "@/lib/workstation-format";

const TIME_RANGES = [
	{ label: "6h", window: "6 hours", seconds: 21600 },
	{ label: "24h", window: "24 hours", seconds: 86400 },
	{ label: "7d", window: "7 days", seconds: 604800 },
	{ label: "30d", window: "30 days", seconds: 2592000 },
] as const;

const CONNECTIVITY_TONE: Record<WorkstationConnectivityStatus, TagColor> = {
	reachable: "success",
	partial: "warning",
	timeout: "info",
	unreachable: "slate",
	error: "danger",
	unsupported: "slate",
};

function connectivityLabel(status: WorkstationConnectivityStatus): string {
	return status.charAt(0).toUpperCase() + status.slice(1);
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
	return (
		<div className="flex justify-between gap-basalt-space-lg text-basalt-base">
			<span className="shrink-0 text-basalt-muted-foreground">{label}</span>
			<span className="min-w-0 break-words text-right font-mono tabular-nums">{value ?? "—"}</span>
		</div>
	);
}

function UsageBar({
	label,
	value,
	detail,
}: {
	label: string;
	value: number | null;
	detail: string;
}) {
	return (
		<div className="space-y-basalt-space-sm">
			<div className="flex items-baseline justify-between gap-basalt-space-lg">
				<span className="text-basalt-sm font-medium">{label}</span>
				<span className="font-display font-semibold tabular-nums">{formatPercent(value)}</span>
			</div>
			<div className="h-1.5 overflow-hidden rounded-full bg-basalt-muted">
				{value !== null && (
					<div
						className="h-full rounded-full bg-basalt-primary"
						style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
					/>
				)}
			</div>
			<p className="text-basalt-sm text-basalt-muted-foreground">{detail}</p>
		</div>
	);
}

function connectivityColumns(
	serverName: (serverId: string) => string,
): DataTableColumn<WorkstationConnectivity>[] {
	return [
		{
			id: "server",
			header: "Server",
			sortable: false,
			accessor: (entry) => (
				<Link
					to={`/hosts/${hashHostId(entry.server_id)}`}
					className="underline-offset-4 hover:underline"
					title="Open the server host detail"
				>
					{serverName(entry.server_id)}
				</Link>
			),
		},
		{
			id: "address",
			header: "Address",
			sortable: false,
			accessor: (entry) => (
				<span className="font-mono">
					{entry.address}
					<span className="ml-basalt-space-sm text-basalt-muted-foreground">v{entry.family}</span>
				</span>
			),
		},
		{
			id: "status",
			header: "ICMP",
			sortable: false,
			accessor: (entry) => (
				<TagBadge
					name={connectivityLabel(entry.status)}
					color={CONNECTIVITY_TONE[entry.status]}
					size="sm"
				/>
			),
		},
		{
			id: "rtt1",
			header: "RTT 1",
			sortable: false,
			textAlign: "end",
			accessor: (entry) => formatRtt(entry.rtts_ms[0]),
		},
		{
			id: "rtt2",
			header: "RTT 2",
			sortable: false,
			textAlign: "end",
			accessor: (entry) => formatRtt(entry.rtts_ms[1]),
		},
		{
			id: "rtt3",
			header: "RTT 3",
			sortable: false,
			textAlign: "end",
			accessor: (entry) => formatRtt(entry.rtts_ms[2]),
		},
		{
			id: "loss",
			header: "Loss",
			sortable: false,
			textAlign: "end",
			accessor: (entry) => formatLoss(entry),
		},
		{
			id: "avg",
			header: "Average",
			sortable: false,
			textAlign: "end",
			accessor: (entry) => formatRtt(rttAverage(entry.rtts_ms)),
		},
	];
}

function WorkstationNotFound({ id }: { id: string }) {
	return (
		<div className="space-y-basalt-layout">
			<PageHeader
				title="Workstation not found"
				description="This workstation was deleted or is no longer available."
			/>
			<p className="font-mono text-basalt-sm text-basalt-muted-foreground">{id}</p>
			<Button asChild={true} variant="outline">
				<Link to="/workstations">
					<ArrowLeft aria-hidden="true" />
					Back to workstations
				</Link>
			</Button>
		</div>
	);
}

function WorkstationDetailBody({ record }: { record: WorkstationRecord }) {
	const [rangeSeconds, setRangeSeconds] = useState(86400);
	const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
	const now = Math.floor(Date.now() / 1000 / 60) * 60;
	const from = now - rangeSeconds;
	const windowLabel = `Last ${
		TIME_RANGES.find((range) => range.seconds === rangeSeconds)?.window ?? "window"
	}`;

	const { data: hosts } = useHosts();
	const metricsPages = useWorkstationMetricsPages(record.id, from, now);
	const history = useWorkstationConnectivity(record.id, from, now, 100);

	const report = record.latest_report;
	const connectivity = connectivityRows(report);
	const status = computeWorkstationStatus(record, now);
	const collectionErrors = workstationCollectionErrors(record);
	const serverName = (serverId: string) =>
		hosts?.find((host) => host.host_id === serverId)?.hostname ?? hashHostId(serverId);

	const summary = describeHistory({
		windowLabel,
		newestCount: metricsPages.newestCount,
		olderCount: metricsPages.olderCount,
		hasOlderBeyond: metricsPages.hasOlder,
	});

	function changeRange(next: number) {
		setRangeSeconds(next);
	}

	return (
		<div className="space-y-basalt-layout" data-testid="workstation-detail">
			<div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-basalt-space-lg">
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
				<div className="min-w-0 space-y-basalt-space-sm">
					<div className="flex min-w-0 flex-wrap items-center gap-basalt-space-lg">
						<PageHeader title={record.name} />
						<WorkstationStatusBadge status={status} size="md" />
						<WorkstationDeleteDialog key={record.id} workstation={record} />
					</div>
					<div className="flex flex-wrap items-baseline gap-x-basalt-space-lg gap-y-basalt-space-sm">
						<span
							className="font-mono text-basalt-xl font-semibold tabular-nums"
							data-testid="workstation-public-ip"
						>
							{record.public_ip ?? "No public IP observed"}
						</span>
						<span className="text-basalt-sm text-basalt-muted-foreground">
							Public address observed by the ingest endpoint — the primary identity for this
							machine.
						</span>
					</div>
					<p className="text-basalt-sm text-basalt-muted-foreground">
						Last seen {workstationLastSeen(record.last_seen_at, now)}
						{record.last_seen_at !== null ? ` · ${formatTimestamp(record.last_seen_at)}` : ""}
					</p>
				</div>
			</div>

			<div className="grid min-w-0 gap-basalt-layout lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
				<div className="min-w-0 space-y-basalt-layout">
					<LayerCard>
						<LayerCard.Header>
							<h2 className="flex items-center gap-basalt-space-md">
								<Info aria-hidden="true" className="size-4" />
								Machine
							</h2>
						</LayerCard.Header>
						<LayerCard.Body>
							{report ? (
								<DescriptionList columns={1}>
									<DescriptionList.Item term="Hostname">{report.hostname}</DescriptionList.Item>
									<DescriptionList.Item term="OS">{report.os}</DescriptionList.Item>
									<DescriptionList.Item term="Architecture">{report.arch}</DescriptionList.Item>
									<DescriptionList.Item term="Uptime">
										{formatUptime(report.uptime_seconds)}
									</DescriptionList.Item>
									<DescriptionList.Item term="Last report">
										{formatTimestamp(report.received_at)}
									</DescriptionList.Item>
									<DescriptionList.Item term="Owner">{record.owner}</DescriptionList.Item>
									<DescriptionList.Item term="Enrolled">
										{formatTimestamp(record.created_at)}
									</DescriptionList.Item>
								</DescriptionList>
							) : (
								<div className="space-y-basalt-space-sm">
									<p className="font-medium">No report yet</p>
									<p className="text-basalt-sm text-basalt-muted-foreground">
										This workstation has not uploaded a report. Hostname, OS, capacity and interface
										data will appear after the first successful collection.
									</p>
								</div>
							)}
						</LayerCard.Body>
					</LayerCard>

					<LayerCard>
						<LayerCard.Header>
							<h2>Capacity</h2>
						</LayerCard.Header>
						<LayerCard.Body className="space-y-basalt-layout">
							{report ? (
								<>
									<UsageBar
										label={`CPU · ${report.cpu.count} threads`}
										value={report.cpu.usage_pct}
										detail={
											report.cpu.usage_pct === null
												? `${report.cpu.model} · usage not reported by this platform`
												: report.cpu.model
										}
									/>
									<UsageBar
										label="Memory"
										value={report.mem.used_pct}
										detail={`${formatMemory(report.mem.total_bytes - report.mem.available_bytes) ?? "—"} used of ${formatMemory(report.mem.total_bytes) ?? "—"}`}
									/>
									<div className="space-y-basalt-space-sm">
										<h3 className="text-basalt-sm font-semibold">Disks</h3>
										{report.disk.length === 0 ? (
											<p className="text-basalt-sm text-basalt-muted-foreground">
												No disk capacity reported.
											</p>
										) : (
											report.disk.map((disk) => (
												<UsageBar
													key={disk.mount}
													label={disk.mount}
													value={disk.used_pct}
													detail={`${formatMemory(disk.available_bytes) ?? "—"} available of ${formatMemory(disk.total_bytes) ?? "—"}`}
												/>
											))
										)}
									</div>
								</>
							) : (
								<p className="text-basalt-sm text-basalt-muted-foreground">
									No capacity data until the first report.
								</p>
							)}
						</LayerCard.Body>
					</LayerCard>

					<LayerCard>
						<LayerCard.Header>
							<h2 className="flex items-center gap-basalt-space-md">
								<Network aria-hidden="true" className="size-4" />
								Network interfaces
							</h2>
						</LayerCard.Header>
						<LayerCard.Body>
							{report && report.network.interfaces.length > 0 ? (
								<div className="space-y-basalt-layout">
									{report.network.interfaces.map((iface) => (
										<div key={iface.name} className="space-y-basalt-space-sm">
											<h3 className="font-mono text-basalt-sm font-semibold">{iface.name}</h3>
											{iface.addresses.length === 0 ? (
												<p className="text-basalt-sm text-basalt-muted-foreground">
													No addresses reported.
												</p>
											) : (
												<ul className="space-y-basalt-space-xs">
													{iface.addresses.map((address) => (
														<li
															key={`${iface.name}-${address.address}`}
															className="flex flex-wrap items-baseline gap-basalt-space-md text-basalt-sm"
														>
															<span className="font-mono">{address.address}</span>
															<TagBadge name={`IPv${address.family}`} size="sm" />
															{address.internal && (
																<span className="text-basalt-muted-foreground">internal</span>
															)}
														</li>
													))}
												</ul>
											)}
										</div>
									))}
								</div>
							) : (
								<p className="text-basalt-sm text-basalt-muted-foreground">
									No interface addresses reported.
								</p>
							)}
						</LayerCard.Body>
					</LayerCard>

					{report && (report.targets_error !== null || collectionErrors.length > 0) && (
						<LayerCard data-testid="workstation-report-errors">
							<LayerCard.Header>
								<h2 className="flex items-center gap-basalt-space-md text-basalt-warning">
									<AlertTriangle aria-hidden="true" className="size-4" />
									Collection problems
								</h2>
							</LayerCard.Header>
							<LayerCard.Body className="space-y-basalt-space-sm text-basalt-sm">
								{report.targets_error !== null && (
									<p>
										<span className="font-medium">Target discovery:</span> {report.targets_error}
									</p>
								)}
								{collectionErrors.map((error) => (
									<p key={error} className="text-basalt-muted-foreground">
										{error}
									</p>
								))}
							</LayerCard.Body>
						</LayerCard>
					)}

					<WorkstationHistory
						metrics={metricsPages.metrics}
						connectivity={history.data?.targets ?? []}
						windowLabel={summary.label}
						windowSeconds={rangeSeconds}
						limit={history.data?.limit ?? 100}
						serverName={serverName}
						selectedServerId={selectedServerId}
						onSelectServer={setSelectedServerId}
						historyNote={summary.note}
						canLoadOlder={metricsPages.hasOlder}
						onLoadOlder={metricsPages.loadOlder}
						loadingOlder={metricsPages.isLoadingOlder}
						loading={metricsPages.isLoading || (history.isLoading && !history.data)}
						metricsError={metricsPages.error !== undefined && metricsPages.metrics.length === 0}
						connectivityError={history.error !== undefined && !history.data}
					/>
				</div>

				<div className="min-w-0 space-y-basalt-layout">
					<LayerCard>
						<LayerCard.Header>
							<h2>Window</h2>
						</LayerCard.Header>
						<LayerCard.Body className="space-y-basalt-layout">
							<p className="text-basalt-sm text-basalt-muted-foreground">
								{connectivityWindowLabel(history.data?.limit ?? 100)} in the selected window.
							</p>
							<SegmentControl
								legend="History window"
								className={INLINE_SEGMENT}
								value={String(rangeSeconds)}
								onValueChange={(value) => changeRange(Number(value))}
								options={TIME_RANGES.map(({ label, seconds }) => ({
									label,
									value: String(seconds),
								}))}
							/>
							{metricsPages.isLoading ? <Skeleton className="h-40 w-full" /> : null}
						</LayerCard.Body>
					</LayerCard>

					<LayerCard data-testid="workstation-connectivity">
						<LayerCard.Header>
							<h2>Connectivity</h2>
						</LayerCard.Header>
						<LayerCard.Body className="space-y-basalt-space-sm">
							<p className="text-basalt-sm text-basalt-muted-foreground">
								Three ICMP pings from this workstation to each authorized server. Unreachable or
								timeout is a reachability result, not an application-health verdict.
							</p>
						</LayerCard.Body>
						<DataTable
							aria-label="Connectivity targets"
							edge="attached"
							columns={connectivityColumns(serverName)}
							data={connectivity}
							getRowId={(entry) => `${entry.server_id}-${entry.address}`}
							empty="No connectivity targets in the latest report."
						/>
					</LayerCard>

					<LayerCard>
						<LayerCard.Body>
							<InfoRow label="Root disk" value={formatPercent(rootDiskUsedPct(report))} />
							<InfoRow label="Public IP" value={record.public_ip ?? "Not observed"} />
							<InfoRow label="Last seen" value={workstationLastSeen(record.last_seen_at, now)} />
						</LayerCard.Body>
					</LayerCard>
				</div>
			</div>
		</div>
	);
}

export function WorkstationDetailPage() {
	const params = useParams<{ id: string }>();
	const id = params.id ?? "";
	const { data: record, error, mutate } = useWorkstation(id);

	if (error && !record) {
		return error instanceof ApiError && error.status === 404 ? (
			<WorkstationNotFound id={id} />
		) : (
			<div className="space-y-basalt-layout">
				<PageHeader
					title="Workstation unavailable"
					description="The workstation detail could not be loaded."
				/>
				<Button variant="outline" onClick={() => void mutate()}>
					Try again
				</Button>
			</div>
		);
	}

	if (!record) {
		return (
			<div className="space-y-basalt-layout">
				<Skeleton className="h-8 w-56" />
				<div className="grid gap-basalt-layout lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
					<Skeleton className="h-72 w-full" />
					<Skeleton className="h-72 w-full" />
				</div>
			</div>
		);
	}

	return <WorkstationDetailBody record={record} />;
}
