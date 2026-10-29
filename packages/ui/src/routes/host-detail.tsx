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
import { MaintenancePanel } from "@/components/host-maintenance-panel";
import { HostTagsPanel } from "@/components/host-tags-panel";
import { SoftwarePanel, WebsitesPanel } from "@/components/host-tier2-panels";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAlerts, useHostDetail, useHostMetrics, useHosts, useHostTier2 } from "@/hooks";
import { formatMemory, formatUptime } from "@/lib/host-card-format";
import { capitalizeVirt, formatBootTime, formatCpuLabel } from "@/lib/host-detail-format";

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
		<div className="flex justify-between text-basalt-base">
			<span className="text-basalt-muted-foreground">{label}</span>
			<span className="font-mono tabular-nums">{value ?? "—"}</span>
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
			{/* Header */}
			<div
				className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-basalt-space-lg"
				data-testid="host-detail-header"
			>
				<Button asChild={true} variant="ghost" size="icon">
					<Link to="/hosts" aria-label="Back to hosts">
						<ArrowLeft aria-hidden="true" strokeWidth={1.5} />
					</Link>
				</Button>
				<div className="min-w-0 space-y-basalt-space-lg">
					<div className="grid items-start gap-basalt-space-lg xl:grid-cols-[minmax(0,1fr)_auto]">
						<div className="min-w-0 space-y-basalt-space-sm">
							<div className="flex min-w-0 flex-wrap items-center gap-basalt-space-lg">
								<div className="min-w-0 max-w-full">
									<PageHeader title={host?.hostname ?? hid} />
								</div>
								{host && <StatusBadge status={host.status} />}
							</div>
							{detail && (
								<DescriptionEditor
									hid={hid}
									value={detail.description}
									onSaved={handleDescriptionSaved}
								/>
							)}
						</div>
						<div className="flex min-w-0 flex-wrap items-center gap-basalt-space-lg">
							<SegmentControl
								legend="Time range"
								className="[&>legend]:sr-only"
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
					{host && <HostTagsPanel key={host.host_id} hostId={host.host_id} />}
				</div>
			</div>

			{/* Metrics — simplified for now */}
			{metricsLoading && !metricsResponse ? (
				<div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
					<div className="space-y-4">
						{Array.from({ length: 4 }, (_, i) => (
							<LayerCard key={`chart-skeleton-${i.toString()}`} className="p-4 md:p-5">
								<Skeleton className="h-64 w-full" />
							</LayerCard>
						))}
					</div>
					<div className="space-y-4">
						<LayerCard className="p-4 md:p-5">
							<Skeleton className="h-32 w-full" />
						</LayerCard>
					</div>
				</div>
			) : metricsResponse ? (
				<div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
					{/* Left column — charts */}
					<div className="min-w-0 space-y-4">
						<div className="flex items-baseline justify-between">
							<h2 className="text-basalt-base font-semibold">Metrics</h2>
							<span className="text-basalt-sm text-basalt-muted-foreground">
								Last {TIME_RANGES.find((r) => r.seconds === rangeSeconds)?.label ?? "—"}
							</span>
						</div>
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
						<h2 className="text-basalt-base font-semibold">Overview</h2>
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
										{detail?.public_ip && <InfoRow label="Public IP" value={detail.public_ip} />}
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
