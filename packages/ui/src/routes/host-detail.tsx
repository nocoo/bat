import { hashHostId } from "@bat/shared";
import { Button, SegmentControl } from "@nocoo/basalt";
import { InlineEditable } from "@nocoo/basalt/components/inline-editable";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { AlertTriangle, ArrowLeft, Info } from "lucide-react";
import { useCallback, useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError, patchAPI } from "@/api";
import {
	CpuChart,
	DiskBars,
	DiskIoChart,
	MemoryChart,
	NetworkChart,
	PsiChart,
	TcpChart,
	TopProcessesTable,
} from "@/components/charts";
import { HostAlertsCard } from "@/components/host-alerts-card";
import { AllowedPortsPanel } from "@/components/host-allowed-ports";
import { HostDeleteDialog } from "@/components/host-delete-dialog";
import { HostInterfaceAddresses } from "@/components/host-interface-addresses";
import { MaintenancePanel } from "@/components/host-maintenance-panel";
import { HostPublicAddress } from "@/components/host-public-address";
import { HostTagsPanel } from "@/components/host-tags-panel";
import { SoftwarePanel, WebsitesPanel } from "@/components/host-tier2-panels";
import { SkeletonChartCard, SkeletonRail } from "@/components/layout/page-skeleton";
import { type ReadingItem, Readings } from "@/components/layout/reading";
import { INLINE_SEGMENT } from "@/components/layout/segment";
import { StatusBadge } from "@/components/status-badge";
import { useAlerts, useHostDetail, useHostMetrics, useHosts, useHostTier2 } from "@/hooks";
import { formatLastSeen, formatMemory, formatUptime } from "@/lib/host-card-format";
import { capitalizeVirt, formatBootTime, formatCpuLabel } from "@/lib/host-detail-format";
import { chart } from "@/lib/palette";
import { formatPercent } from "@/lib/workstation-format";

const TIME_RANGES = [
	{ label: "1h", seconds: 3600 },
	{ label: "6h", seconds: 21600 },
	{ label: "24h", seconds: 86400 },
	{ label: "7d", seconds: 604800 },
	{ label: "30d", seconds: 2592000 },
	{ label: "90d", seconds: 7776000 },
] as const;

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
	return (
		<div className="flex justify-between gap-basalt-space-sm text-basalt-base">
			<span className="shrink-0 text-basalt-muted-foreground">{label}</span>
			<span className="min-w-0 break-all text-right font-mono tabular-nums">{value ?? "—"}</span>
		</div>
	);
}

function DescriptionEditor({
	hid,
	value,
	onSaved,
}: {
	hid: string;
	value: string | null;
	onSaved: (value: string | null) => void;
}) {
	const [editing, setEditing] = useState(false);
	return (
		<div data-bat-dirty={editing}>
			<InlineEditable
				label="Host description"
				value={value ?? ""}
				editing={editing}
				onEditingChange={setEditing}
				required={false}
				placeholder="Add description..."
				validate={(draft) =>
					draft.length > 200 ? "Description must be 200 characters or fewer." : undefined
				}
				onSave={async (draft) => {
					const description = draft || null;
					await patchAPI(`/api/hosts/${hid}/description`, { description });
					onSaved(description);
				}}
			/>
		</div>
	);
}

export function HostDetailPage() {
	const params = useParams<{ id: string }>();
	const hid = params.id ?? "";

	const [rangeSeconds, setRangeSeconds] = useState(3600);
	// Quantize to minute boundary so SWR key stays stable within the same minute,
	// but recompute on every render so auto-refresh picks up new samples each minute.
	const now = Math.floor(Date.now() / 1000 / 60) * 60;
	const from = now - rangeSeconds;

	const { data: hosts } = useHosts();
	const { data: detail, error: detailError, mutate: mutateDetail } = useHostDetail(hid);
	const { data: alerts } = useAlerts();
	const { data: metricsResponse, isLoading: metricsLoading } = useHostMetrics(hid, from, now);
	const { data: tier2 } = useHostTier2(hid);

	const host =
		hosts?.find((item) => item.host_id === hid || hashHostId(item.host_id) === hid) ?? detail;

	const handleDescriptionSaved = useCallback(
		(desc: string | null) => {
			if (detail) {
				mutateDetail({ ...detail, description: desc }, false);
			}
		},
		[detail, mutateDetail],
	);

	const series = (metricsResponse?.data ?? []).map((point) => ({
		ts: point.ts,
		cpu: point.cpu_usage_pct,
		mem: point.mem_used_pct,
		load1: point.cpu_load1,
		rx: point.net_rx_bytes_avg,
		tx: point.net_tx_bytes_avg,
	}));
	const trend = (key: "cpu" | "mem" | "load1" | "rx") =>
		series
			.map((point) => ({ x: point.ts * 1000, value: point[key] }))
			.filter((point): point is { x: number; value: number } => point.value !== null);
	const last = series[series.length - 1];
	const readings: ReadingItem[] = [
		{
			label: "CPU",
			value: formatPercent(last?.cpu ?? host?.cpu_usage_pct ?? null),
			detail:
				detail?.cpu_logical === null || detail?.cpu_logical === undefined
					? "no thread count"
					: `${detail.cpu_logical} thread${detail.cpu_logical === 1 ? "" : "s"}`,
			color: chart.pink,
			points: trend("cpu"),
		},
		{
			label: "Memory",
			value: formatPercent(last?.mem ?? host?.mem_used_pct ?? null),
			detail: `${formatMemory(detail?.mem_total_bytes ?? host?.mem_total_bytes ?? null) ?? "—"} total`,
			color: chart.sky,
			points: trend("mem"),
		},
		{
			label: "Load 1m",
			value: last?.load1 === null || last?.load1 === undefined ? "—" : last.load1.toFixed(2),
			detail: "one minute average",
			color: chart.teal,
			points: trend("load1"),
		},
		{
			label: "Disk",
			value: formatPercent(host?.disk_root_used_pct ?? null),
			detail: "root volume",
			color: chart.orange,
			points: [],
		},
	];
	if (detailError instanceof ApiError && detailError.status === 404) {
		return (
			<div className="space-y-basalt-layout">
				<PageHeader
					title="Host not found"
					description="This host was deleted or is no longer available."
				/>
				<Button asChild variant="outline">
					<Link to="/hosts">
						<ArrowLeft aria-hidden="true" />
						Back to hosts
					</Link>
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-basalt-layout">
			<LayerCard data-testid="host-detail-header" padding="none">
				<div className="flex items-start gap-basalt-space-md px-basalt-card py-basalt-layout">
					<Button
						asChild={true}
						variant="ghost"
						size="icon"
						className="h-basalt-control-sm min-h-0 w-basalt-control-sm min-w-0"
					>
						<Link to="/hosts" aria-label="Back to hosts">
							<ArrowLeft aria-hidden="true" strokeWidth={1.5} />
						</Link>
					</Button>
					<div className="min-w-0 flex-1 space-y-basalt-space-md">
						<div className="flex flex-wrap items-center justify-between gap-x-basalt-layout gap-y-basalt-space-lg">
							<div className="flex min-w-0 flex-wrap items-center gap-basalt-space-lg [&>[data-testid=status-badge]]:h-basalt-control-sm">
								<h1 className="truncate text-basalt-3xl font-semibold text-basalt-foreground">
									{host?.hostname ?? hid}
								</h1>
								{host && <StatusBadge status={host.status} />}
								{host && <HostTagsPanel key={host.host_id} hostId={host.host_id} />}
							</div>
							<div className="flex min-w-0 max-w-full items-center gap-basalt-space-lg">
								<SegmentControl
									legend="Time range"
									className={INLINE_SEGMENT}
									value={String(rangeSeconds)}
									onValueChange={(value) => setRangeSeconds(Number(value))}
									options={TIME_RANGES.map(({ label, seconds }) => ({
										label,
										value: String(seconds),
									}))}
								/>
								{host && <HostDeleteDialog key={host.host_id} host={host} routeId={hid} />}
							</div>
						</div>
						{detail && (
							<DescriptionEditor
								hid={hid}
								value={detail.description}
								onSaved={handleDescriptionSaved}
							/>
						)}
					</div>
				</div>

				<Readings
					lead={
						<>
							<p className="text-basalt-sm text-basalt-muted-foreground">Public address</p>
							<HostPublicAddress detail={detail} />
							<p className="mt-basalt-space-xs text-basalt-sm text-basalt-muted-foreground">
								{host ? `Last seen ${formatLastSeen(host.last_seen, now)}` : "No report yet"}
							</p>
						</>
					}
					items={readings}
				/>
			</LayerCard>

			{/* Metrics — simplified for now */}
			{metricsLoading && !metricsResponse ? (
				<div className="grid gap-basalt-layout lg:grid-cols-[minmax(0,1fr)_22rem]">
					<div className="min-w-0 space-y-basalt-layout">
						<SkeletonChartCard />
						<SkeletonChartCard />
					</div>
					<div className="min-w-0 space-y-basalt-layout">
						<SkeletonRail cards={2} />
					</div>
				</div>
			) : metricsResponse ? (
				<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
					{/* Left column — charts */}
					<div className="min-w-0 space-y-4">
						<CpuChart data={metricsResponse.data} rangeSeconds={rangeSeconds} />
						<MemoryChart data={metricsResponse.data} rangeSeconds={rangeSeconds} />
						<NetworkChart
							data={metricsResponse.data}
							rangeSeconds={rangeSeconds}
							resolution={metricsResponse.resolution}
						/>
						<PsiChart data={metricsResponse.data} rangeSeconds={rangeSeconds} />
						<DiskIoChart
							data={metricsResponse.data}
							rangeSeconds={rangeSeconds}
							resolution={metricsResponse.resolution}
						/>
						<TcpChart data={metricsResponse.data} rangeSeconds={rangeSeconds} />
						<TopProcessesTable topProcessesJson={detail?.top_processes_json ?? null} />
					</div>

					{/* Right column — system info + disks */}
					<div className="space-y-4 min-w-0">
						{host && (
							<HostAlertsCard alerts={alerts?.filter((a) => a.host_id === host.host_id) ?? []} />
						)}
						<DiskBars data={metricsResponse.data} />
						{host && (
							<LayerCard>
								<LayerCard.Header>
									<h2 className="flex items-center gap-2">
										<Info className="h-4 w-4" />
										System Info
									</h2>
								</LayerCard.Header>
								<LayerCard.Body>
									<div className="grid gap-3">
										<InfoRow label="OS" value={host.os} />
										<InfoRow label="Kernel" value={host.kernel} />
										<InfoRow label="Architecture" value={host.arch} />
										<InfoRow
											label="CPU"
											value={formatCpuLabel(
												host.cpu_model,
												detail?.cpu_physical,
												detail?.cpu_logical,
											)}
										/>
										<InfoRow label="Memory" value={formatMemory(detail?.mem_total_bytes ?? null)} />
										{detail?.swap_total_bytes != null && (
											<InfoRow label="Swap" value={formatMemory(detail.swap_total_bytes)} />
										)}
										{detail?.virtualization && (
											<InfoRow
												label="Virtualization"
												value={capitalizeVirt(detail.virtualization)}
											/>
										)}
										{detail?.boot_mode && (
											<InfoRow label="Boot Mode" value={detail.boot_mode.toUpperCase()} />
										)}
										{detail?.probe_version && (
											<InfoRow label="Probe Version" value={`v${detail.probe_version}`} />
										)}
										<InfoRow label="Public IPv4" value={detail?.public_ip_v4} />
										<InfoRow label="Public IPv6" value={detail?.public_ip_v6} />
										<HostInterfaceAddresses interfaces={detail?.net_interfaces} />
										<InfoRow label="Uptime" value={formatUptime(host.uptime_seconds)} />
										<InfoRow label="Boot Time" value={formatBootTime(host.boot_time)} />
										{detail?.timezone && <InfoRow label="Timezone" value={detail.timezone} />}
									</div>
								</LayerCard.Body>
							</LayerCard>
						)}
						{host && <MaintenancePanel hostId={host.host_id} />}
						{host && (
							<AllowedPortsPanel
								hostId={host.host_id}
								hashedHostId={hid}
								hostAlerts={alerts?.filter((a) => a.host_id === host.host_id) ?? []}
							/>
						)}
						<WebsitesPanel tier2={tier2} />
						<SoftwarePanel tier2={tier2} />
					</div>
				</div>
			) : (
				<div className="flex flex-col items-center justify-center py-20 text-basalt-muted-foreground">
					<AlertTriangle className="h-12 w-12 mb-4" strokeWidth={1} />
					<p className="text-basalt-base">No metrics data available</p>
				</div>
			)}
		</div>
	);
}
