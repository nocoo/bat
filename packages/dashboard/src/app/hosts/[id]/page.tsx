"use client";

import { CpuChart, DiskBars, MemoryChart, NetworkChart } from "@/components/charts";
import { formatUptime } from "@/components/host-card";
import { AppShell } from "@/components/layout";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHostMetrics, useHosts } from "@/lib/hooks";
import { AlertTriangle, Clock, Cpu, Globe, HardDrive, Info } from "lucide-react";
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
		<div className="flex gap-1">
			{TIME_RANGES.map((range) => (
				<button
					key={range.label}
					type="button"
					onClick={() => onSelect(range.seconds)}
					className={`px-3 py-1 rounded-md text-sm transition-colors ${
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

export default function HostDetailPage() {
	const params = useParams<{ id: string }>();
	const hostId = params.id;

	const [rangeSeconds, setRangeSeconds] = useState(3600);
	const now = Math.floor(Date.now() / 1000);
	const from = now - rangeSeconds;

	const { data: hosts } = useHosts();
	const { data: metricsResponse, isLoading: metricsLoading } = useHostMetrics(hostId, from, now);

	const host = hosts?.find((h) => h.host_id === hostId);

	return (
		<AppShell
			breadcrumbs={[{ label: "Hosts", href: "/hosts" }, { label: host?.hostname ?? hostId }]}
		>
			<div className="space-y-6">
				{/* Header */}
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-bold">{host?.hostname ?? hostId}</h1>
						{host && <StatusBadge status={host.status} />}
					</div>
					<TimeRangePicker selected={rangeSeconds} onSelect={setRangeSeconds} />
				</div>

				{/* System Info */}
				{host && (
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<Info className="h-4 w-4" />
								System Info
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
								<InfoRow label="OS" value={host.os} />
								<InfoRow label="Kernel" value={host.kernel} />
								<InfoRow label="Architecture" value={host.arch} />
								<InfoRow label="Uptime" value={formatUptime(host.uptime_seconds)} />
								<InfoRow label="Alerts" value={String(host.alert_count)} />
							</div>
						</CardContent>
					</Card>
				)}

				{metricsLoading ? (
					<div className="grid gap-4 lg:grid-cols-2">
						{Array.from({ length: 4 }, (_, i) => (
							<Card key={`chart-skeleton-${i.toString()}`}>
								<CardContent className="py-6">
									<Skeleton className="h-64 w-full" />
								</CardContent>
							</Card>
						))}
					</div>
				) : metricsResponse ? (
					<div className="grid gap-4 lg:grid-cols-2">
						{/* CPU Chart */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<Cpu className="h-4 w-4" />
									CPU
								</CardTitle>
							</CardHeader>
							<CardContent>
								<CpuChart data={metricsResponse.data} />
							</CardContent>
						</Card>

						{/* Memory Chart */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<HardDrive className="h-4 w-4" />
									Memory
								</CardTitle>
							</CardHeader>
							<CardContent>
								<MemoryChart data={metricsResponse.data} />
							</CardContent>
						</Card>

						{/* Network Chart */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<Globe className="h-4 w-4" />
									Network
								</CardTitle>
							</CardHeader>
							<CardContent>
								<NetworkChart data={metricsResponse.data} resolution={metricsResponse.resolution} />
							</CardContent>
						</Card>

						{/* Disk Usage */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<Clock className="h-4 w-4" />
									Disk Usage
								</CardTitle>
							</CardHeader>
							<CardContent>
								<DiskBars data={metricsResponse.data} />
							</CardContent>
						</Card>
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
