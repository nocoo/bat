"use client";

import { AlertTable } from "@/components/alert-table";
import { CpuChart, DiskBars, MemoryChart, NetworkChart } from "@/components/charts";
import { formatUptime } from "@/components/host-card";
import { AppShell } from "@/components/layout";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { useAlerts, useHostMetrics, useHosts } from "@/lib/hooks";
import { hashHostId } from "@bat/shared";
import { AlertTriangle, ChevronRight, Info, ShieldAlert } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

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
		<div className="flex flex-wrap gap-1">
			{TIME_RANGES.map((range) => (
				<button
					key={range.label}
					type="button"
					onClick={() => onSelect(range.seconds)}
					className={`px-2.5 py-1 rounded-md text-sm transition-colors ${
						selected === range.seconds
							? "bg-primary text-primary-foreground"
							: "bg-secondary text-secondary-foreground hover:bg-secondary/80"
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
			<span className="font-mono">{value ?? "—"}</span>
		</div>
	);
}

export function formatBootTime(unixSeconds: number | null | undefined): string | null {
	if (unixSeconds == null) return null;
	return new Date(unixSeconds * 1000).toLocaleString();
}

export default function HostDetailPage() {
	const params = useParams<{ id: string }>();
	const hid = params.id;

	const [rangeSeconds, setRangeSeconds] = useState(3600);
	const now = Math.floor(Date.now() / 1000);
	const from = now - rangeSeconds;

	const { data: hosts } = useHosts();
	const { data: metricsResponse, isLoading: metricsLoading } = useHostMetrics(hid, from, now);
	const { data: allAlerts } = useAlerts();

	const host = hosts?.find((h) => hashHostId(h.host_id) === hid);
	const hostAlerts = allAlerts?.filter((a) => hashHostId(a.host_id) === hid) ?? [];

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

				{/* Per-host Active Alerts */}
				{hostAlerts.length > 0 && (
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<ShieldAlert className="h-4 w-4" />
								Active Alerts ({hostAlerts.length})
							</CardTitle>
						</CardHeader>
						<CardContent>
							<AlertTable alerts={hostAlerts} />
						</CardContent>
					</Card>
				)}

				{/* Metrics — primary content, shown first */}
				{metricsLoading ? (
					<div className="space-y-3">
						<h2 className="text-lg font-semibold">Metrics</h2>
						<div className="grid gap-4 lg:grid-cols-2">
							{Array.from({ length: 4 }, (_, i) => (
								<div
									key={`chart-skeleton-${i.toString()}`}
									className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5"
								>
									<Skeleton className="h-64 w-full" />
								</div>
							))}
						</div>
					</div>
				) : metricsResponse ? (
					<div className="space-y-3">
						<div className="flex items-baseline justify-between">
							<h2 className="text-lg font-semibold">Metrics</h2>
							<span className="text-xs text-muted-foreground">
								Last {TIME_RANGES.find((r) => r.seconds === rangeSeconds)?.label ?? "—"}
							</span>
						</div>
						<div className="grid gap-4 lg:grid-cols-2">
							<CpuChart data={metricsResponse.data} rangeSeconds={rangeSeconds} />
							<MemoryChart data={metricsResponse.data} rangeSeconds={rangeSeconds} />
							<NetworkChart
								data={metricsResponse.data}
								resolution={metricsResponse.resolution}
								rangeSeconds={rangeSeconds}
							/>
							<DiskBars data={metricsResponse.data} />
						</div>
					</div>
				) : (
					<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
						<AlertTriangle className="h-12 w-12 mb-4" strokeWidth={1} />
						<p className="text-sm">No metrics data available</p>
					</div>
				)}

				{/* System Info — collapsible, secondary reference data */}
				{host && (
					<Collapsible>
						<Card>
							<CollapsibleTrigger asChild>
								<CardHeader className="cursor-pointer select-none hover:bg-accent/50 transition-colors rounded-t-[var(--radius-card)]">
									<CardTitle className="flex items-center gap-2 text-base">
										<ChevronRight className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-90" />
										<Info className="h-4 w-4" />
										System Info
									</CardTitle>
								</CardHeader>
							</CollapsibleTrigger>
							<CollapsibleContent>
								<CardContent>
									<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
										<InfoRow label="OS" value={host.os} />
										<InfoRow label="Kernel" value={host.kernel} />
										<InfoRow label="Architecture" value={host.arch} />
										<InfoRow label="CPU" value={host.cpu_model} />
										<InfoRow label="Uptime" value={formatUptime(host.uptime_seconds)} />
										<InfoRow label="Boot Time" value={formatBootTime(host.boot_time)} />
										<InfoRow label="Alerts" value={String(host.alert_count)} />
									</div>
								</CardContent>
							</CollapsibleContent>
						</Card>
					</Collapsible>
				)}
			</div>
		</AppShell>
	);
}
