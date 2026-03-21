"use client";

import { AlertTable } from "@/components/alert-table";
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
import { AllowedPortsPanel } from "@/components/host-allowed-ports";
import { formatCpuTopology, formatMemory, formatUptime } from "@/components/host-card";
import { HostTagsPanel } from "@/components/host-tags-panel";
import { AppShell } from "@/components/layout";
import { MaintenancePanel } from "@/components/maintenance-panel";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WebsitesPanel } from "@/components/websites-panel";
import {
	useAlerts,
	useAllowedPorts,
	useHostDetail,
	useHostMetrics,
	useHostTier2,
	useHosts,
} from "@/lib/hooks";
import type { DetectedSoftware, SoftwareCategory } from "@bat/shared";
import { hashHostId } from "@bat/shared";
import { AlertTriangle, Box, Info, ShieldAlert } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

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

/** Format CPU label — "AMD EPYC 7763 (4 cores, 8 threads)" */
function formatCpuLabel(
	model: string | null | undefined,
	physical: number | null | undefined,
	logical: number | null | undefined,
): string | null {
	const topology = formatCpuTopology(physical ?? null, logical ?? null);
	if (!model && !topology) return null;
	if (!topology) return model ?? null;
	const suffix =
		physical != null && logical != null && physical !== logical
			? `(${physical} cores, ${logical} threads)`
			: `(${physical ?? logical} cores)`;
	return model ? `${model} ${suffix}` : suffix;
}

/** Capitalize virtualization label — "kvm" → "KVM", "bare-metal" → "Bare-Metal" */
function capitalizeVirt(v: string): string {
	const map: Record<string, string> = {
		kvm: "KVM",
		vmware: "VMware",
		hyperv: "Hyper-V",
		aws: "AWS",
		gce: "GCE",
		virtualbox: "VirtualBox",
		xen: "Xen",
		"bare-metal": "Bare Metal",
		container: "Container",
		digitalocean: "DigitalOcean",
		hetzner: "Hetzner",
	};
	return map[v] ?? v;
}

/** Format net interfaces for display — "eth0: 10.0.1.5" */
function formatNetInterfaces(
	interfaces: { iface: string; ipv4: string[]; ipv6: string[] }[],
): string {
	return interfaces
		.map((ni) => {
			const ips = [...ni.ipv4, ...ni.ipv6.filter((ip) => !ip.startsWith("fe80"))];
			return ips.length > 0 ? `${ni.iface}: ${ips.join(", ")}` : null;
		})
		.filter(Boolean)
		.join(" | ");
}

/** Format disks for display — "sda: 500 GB SSD" */
function formatDisks(disks: { device: string; size_bytes: number; rotational: boolean }[]): string {
	return disks
		.map((d) => {
			const gb = Math.round(d.size_bytes / (1024 * 1024 * 1024));
			const type = d.rotational ? "HDD" : "SSD";
			return `${d.device}: ${gb} GB ${type}`;
		})
		.join(", ");
}

// --- Software card helpers ---

const CATEGORY_LABELS: Record<SoftwareCategory, string> = {
	web: "Web Servers",
	database: "Databases",
	cache: "Caches",
	queue: "Message Queues",
	runtime: "Runtimes",
	monitoring: "Monitoring",
	security: "Security",
	infra: "Infrastructure",
	container: "Containers",
	proxy: "Proxies & Tunnels",
};

const CATEGORY_ORDER: SoftwareCategory[] = [
	"web",
	"database",
	"cache",
	"queue",
	"runtime",
	"container",
	"proxy",
	"monitoring",
	"security",
	"infra",
];

/** Group software by category, preserving a fixed display order. */
function groupByCategory(
	items: DetectedSoftware[],
): { category: SoftwareCategory; label: string; items: DetectedSoftware[] }[] {
	const map = new Map<SoftwareCategory, DetectedSoftware[]>();
	for (const item of items) {
		const cat = item.category;
		const list = map.get(cat);
		if (list) {
			list.push(item);
		} else {
			map.set(cat, [item]);
		}
	}
	return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
		category: c,
		label: CATEGORY_LABELS[c],
		items: map.get(c) ?? [],
	}));
}

function SoftwareItem({ sw }: { sw: DetectedSoftware }) {
	return (
		<div className="flex items-center gap-2 text-sm">
			<span
				className={`h-1.5 w-1.5 rounded-full shrink-0 ${sw.running ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
			/>
			<span className="font-medium">{sw.name}</span>
			{sw.version && <span className="text-xs text-muted-foreground">{sw.version}</span>}
			{sw.listening_ports.length > 0 && (
				<span className="text-xs text-muted-foreground ml-auto font-mono">
					:{sw.listening_ports.join(",")}
				</span>
			)}
		</div>
	);
}

function SoftwareCard({ software }: { software: DetectedSoftware[] }) {
	const groups = groupByCategory(software);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<Box className="h-4 w-4" />
					Installed Software ({software.length})
				</CardTitle>
			</CardHeader>
			<CardContent>
				{groups.length === 0 ? (
					<p className="text-sm text-muted-foreground">No software detected</p>
				) : (
					<div className="grid gap-4">
						{groups.map((group) => (
							<div key={group.category}>
								<h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
									{group.label}
								</h4>
								<div className="grid gap-1">
									{group.items.map((sw) => (
										<SoftwareItem key={sw.id} sw={sw} />
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

export default function HostDetailPage() {
	const params = useParams<{ id: string }>();
	const hid = params.id;

	const [rangeSeconds, setRangeSeconds] = useState(3600);
	// Quantize to minute boundary so SWR key stays stable within the same minute,
	// but recompute on every render so auto-refresh picks up new samples each minute.
	const now = Math.floor(Date.now() / 1000 / 60) * 60;
	const from = now - rangeSeconds;

	const { data: hosts } = useHosts();
	const { data: detail } = useHostDetail(hid);
	const { data: metricsResponse, isLoading: metricsLoading } = useHostMetrics(hid, from, now);
	const { data: allAlerts } = useAlerts();
	const { data: tier2 } = useHostTier2(hid);

	const host = hosts?.find((h) => hashHostId(h.host_id) === hid);
	const hostAlerts = allAlerts?.filter((a) => hashHostId(a.host_id) === hid) ?? [];
	const { data: allowedPorts } = useAllowedPorts(host?.host_id ?? null);

	// Build allowedPortsMap for AlertTable
	const allowedPortsMap: Record<string, number[]> = {};
	if (host && allowedPorts && allowedPorts.length > 0) {
		allowedPortsMap[host.host_id] = allowedPorts.map((p) => p.port);
	}

	// Maintenance window for chart overlays
	const maintenanceWindow = useMemo(() => {
		if (!host?.maintenance_start || !host?.maintenance_end) return null;
		return { start: host.maintenance_start, end: host.maintenance_end };
	}, [host?.maintenance_start, host?.maintenance_end]);

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

				{/* Metrics — 6:4 two-column layout */}
				{metricsLoading && !metricsResponse ? (
					<div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
						<div className="space-y-4">
							{Array.from({ length: 4 }, (_, i) => (
								<div
									key={`chart-skeleton-${i.toString()}`}
									className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5"
								>
									<Skeleton className="h-64 w-full" />
								</div>
							))}
						</div>
						<div className="space-y-4">
							<div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
								<Skeleton className="h-32 w-full" />
							</div>
						</div>
					</div>
				) : metricsResponse ? (
					<div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
						{/* Left column — time-series charts (shared X axis) */}
						<div className="space-y-4">
							<div className="flex items-baseline justify-between">
								<h2 className="text-base font-semibold">Metrics</h2>
								<span className="text-xs text-muted-foreground">
									Last {TIME_RANGES.find((r) => r.seconds === rangeSeconds)?.label ?? "—"}
								</span>
							</div>
							<CpuChart
								data={metricsResponse.data}
								rangeSeconds={rangeSeconds}
								maintenanceWindow={maintenanceWindow}
							/>
							<MemoryChart
								data={metricsResponse.data}
								rangeSeconds={rangeSeconds}
								maintenanceWindow={maintenanceWindow}
							/>
							<NetworkChart
								data={metricsResponse.data}
								resolution={metricsResponse.resolution}
								rangeSeconds={rangeSeconds}
								maintenanceWindow={maintenanceWindow}
							/>
							<PsiChart
								data={metricsResponse.data}
								rangeSeconds={rangeSeconds}
								maintenanceWindow={maintenanceWindow}
							/>
							<DiskIoChart
								data={metricsResponse.data}
								resolution={metricsResponse.resolution}
								rangeSeconds={rangeSeconds}
								maintenanceWindow={maintenanceWindow}
							/>
							<TcpChart
								data={metricsResponse.data}
								rangeSeconds={rangeSeconds}
								maintenanceWindow={maintenanceWindow}
							/>
							<TopProcessesTable
								data={metricsResponse.data}
								resolution={metricsResponse.resolution}
							/>
						</div>

						{/* Right column — snapshot / non-time-series */}
						<div className="space-y-4">
							<h2 className="text-base font-semibold">Overview</h2>
							{hostAlerts.length > 0 && (
								<Card>
									<CardHeader>
										<CardTitle className="flex items-center gap-2 text-base">
											<ShieldAlert className="h-4 w-4" />
											Active Alerts ({hostAlerts.length})
										</CardTitle>
									</CardHeader>
									<CardContent>
										<AlertTable
											alerts={hostAlerts}
											showHost={false}
											allowedPortsMap={allowedPortsMap}
										/>
									</CardContent>
								</Card>
							)}
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
											{detail?.net_interfaces && detail.net_interfaces.length > 0 && (
												<InfoRow
													label="IP Addresses"
													value={formatNetInterfaces(detail.net_interfaces)}
												/>
											)}
											{detail?.dns_resolvers && detail.dns_resolvers.length > 0 && (
												<InfoRow label="DNS" value={detail.dns_resolvers.join(", ")} />
											)}
											{detail?.timezone && <InfoRow label="Timezone" value={detail.timezone} />}
											{detail?.disks && detail.disks.length > 0 && (
												<InfoRow label="Disks" value={formatDisks(detail.disks)} />
											)}
										</div>
									</CardContent>
								</Card>
							)}
							{host && <HostTagsPanel hostId={host.host_id} />}
							{host && <AllowedPortsPanel hostId={host.host_id} hostAlerts={hostAlerts} />}
							{host && <MaintenancePanel hid={hid} />}
							{tier2?.software && tier2.software.detected.length > 0 && (
								<SoftwareCard software={tier2.software.detected} />
							)}
							{tier2?.websites && tier2.websites.sites.length > 0 && (
								<WebsitesPanel sites={tier2.websites.sites} />
							)}
							<DiskBars data={metricsResponse.data} />
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
