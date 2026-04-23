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
import { AppShell } from "@/components/layout";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHostDetail, useHostMetrics, useHosts } from "@/hooks";
import { formatMemory, formatUptime } from "@/lib/host-card-format";
import { capitalizeVirt, formatBootTime, formatCpuLabel } from "@/lib/host-detail-format";
import { hashHostId } from "@bat/shared";
import { AlertTriangle, Info } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";

const TIME_RANGES = [
	{ label: "1h", seconds: 3600 },
	{ label: "6h", seconds: 21600 },
	{ label: "24h", seconds: 86400 },
	{ label: "7d", seconds: 604800 },
	{ label: "30d", seconds: 2592000 },
	{ label: "90d", seconds: 7776000 },
] as const;

function TimeRangePicker({
	selected,
	onSelect,
}: { selected: number; onSelect: (seconds: number) => void }) {
	return (
		<div className="flex items-center gap-1 rounded-lg bg-secondary p-1">
			{TIME_RANGES.map((range) => (
				<button
					key={range.label}
					type="button"
					onClick={() => onSelect(range.seconds)}
					className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
						selected === range.seconds
							? "bg-card text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground"
					}`}
				>
					{range.label}
				</button>
			))}
		</div>
	);
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
	return (
		<div className="flex justify-between text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-mono tabular-nums">{value ?? "—"}</span>
		</div>
	);
}

/** Format CPU label — "AMD EPYC 7763 (4 cores, 8 threads)" */

export function HostDetailPage() {
	const params = useParams<{ id: string }>();
	const hid = params.id ?? "";

	const [rangeSeconds, setRangeSeconds] = useState(3600);
	// Quantize to minute boundary so SWR key stays stable within the same minute,
	// but recompute on every render so auto-refresh picks up new samples each minute.
	const now = Math.floor(Date.now() / 1000 / 60) * 60;
	const from = now - rangeSeconds;

	const { data: hosts } = useHosts();
	const { data: detail } = useHostDetail(hid);
	const { data: metricsResponse, isLoading: metricsLoading } = useHostMetrics(hid, from, now);

	const host = hosts?.find((h) => hashHostId(h.host_id) === hid);

	return (
		<AppShell breadcrumbs={[{ label: "Hosts", href: "/hosts" }, { label: host?.hostname ?? hid }]}>
			<div className="space-y-6">
				{/* Header */}
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-bold">{host?.hostname ?? hid}</h1>
						{host && <StatusBadge status={host.status} />}
					</div>
					<TimeRangePicker selected={rangeSeconds} onSelect={setRangeSeconds} />
				</div>

				{/* Metrics — simplified for now */}
				{metricsLoading && !metricsResponse ? (
					<div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
						<div className="space-y-4">
							{Array.from({ length: 4 }, (_, i) => (
								<div
									key={`chart-skeleton-${i.toString()}`}
									className="rounded-card bg-secondary p-4 md:p-5"
								>
									<Skeleton className="h-64 w-full" />
								</div>
							))}
						</div>
						<div className="space-y-4">
							<div className="rounded-card bg-secondary p-4 md:p-5">
								<Skeleton className="h-32 w-full" />
							</div>
						</div>
					</div>
				) : metricsResponse ? (
					<div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
						{/* Left column — charts */}
						<div className="space-y-4">
							<div className="flex items-baseline justify-between">
								<h2 className="text-base font-semibold">Metrics</h2>
								<span className="text-xs text-muted-foreground">
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
							<TopProcessesTable data={metricsResponse.data} />
						</div>

						{/* Right column — system info + disks */}
						<div className="space-y-4">
							<h2 className="text-base font-semibold">Overview</h2>
							<DiskBars data={metricsResponse.data} />
							{host && (
								<Card>
									<CardHeader>
										<CardTitle className="flex items-center gap-2 text-base">
											<Info className="h-4 w-4" />
											System Info
										</CardTitle>
									</CardHeader>
									<CardContent>
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
											<InfoRow
												label="Memory"
												value={formatMemory(detail?.mem_total_bytes ?? null)}
											/>
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
									</CardContent>
								</Card>
							)}
						</div>
					</div>
				) : (
					<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
						<AlertTriangle className="h-12 w-12 mb-4" strokeWidth={1} />
						<p className="text-sm">No metrics data available</p>
					</div>
				)}
			</div>
		</AppShell>
	);
}
