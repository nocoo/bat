import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HostOverviewItem } from "@bat/shared";
import { hashHostId } from "@bat/shared";
import { Clock, Cpu, HardDrive } from "lucide-react";
import Link from "next/link";

function formatUptime(seconds: number | null): string {
	if (seconds === null || seconds <= 0) return "—";
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	if (days > 0) return `${days}d ${hours}h`;
	const minutes = Math.floor((seconds % 3600) / 60);
	return `${hours}h ${minutes}m`;
}

function formatLastSeen(unixSeconds: number): string {
	const now = Math.floor(Date.now() / 1000);
	const delta = now - unixSeconds;
	if (delta < 60) return "just now";
	if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
	if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
	return `${Math.floor(delta / 86400)}d ago`;
}

/** Truncate PRETTY_NAME — "Ubuntu 22.04.3 LTS" → "Ubuntu 22.04" */
function shortenOs(os: string | null): string | null {
	if (!os) return null;
	// Match "Name Major.Minor" and drop patch/suffix
	const match = os.match(/^(\S+)\s+(\d+\.\d+)/);
	return match ? `${match[1]} ${match[2]}` : os;
}

/** Format bytes to human-readable — 8589934592 → "8 GB" */
function formatMemory(bytes: number | null): string | null {
	if (bytes === null) return null;
	const gb = bytes / (1024 * 1024 * 1024);
	if (gb >= 1) return `${Math.round(gb)} GB`;
	const mb = bytes / (1024 * 1024);
	return `${Math.round(mb)} MB`;
}

/** Format CPU topology — "4C/8T" or "4C" if no HT */
function formatCpuTopology(physical: number | null, logical: number | null): string | null {
	if (physical === null && logical === null) return null;
	if (physical !== null && logical !== null && physical !== logical) {
		return `${physical}C/${logical}T`;
	}
	return `${physical ?? logical}C`;
}

/** Build subtitle parts: "Ubuntu 22.04 · x86_64 · 4C/8T · 8 GB" */
function buildSubtitle(host: HostOverviewItem): string | null {
	const parts: string[] = [];
	const os = shortenOs(host.os);
	if (os) parts.push(os);
	if (host.arch) parts.push(host.arch);
	const cpu = formatCpuTopology(host.cpu_physical, host.cpu_logical);
	if (cpu) parts.push(cpu);
	const mem = formatMemory(host.mem_total_bytes);
	if (mem) parts.push(mem);
	return parts.length > 0 ? parts.join(" · ") : null;
}

function MetricRow({
	icon,
	label,
	value,
}: { icon: React.ReactNode; label: string; value: string }) {
	return (
		<div className="flex items-center justify-between text-sm">
			<span className="flex items-center gap-2 text-muted-foreground">
				{icon}
				{label}
			</span>
			<span className="text-base font-semibold font-display tracking-tight">{value}</span>
		</div>
	);
}

export function HostCard({ host }: { host: HostOverviewItem }) {
	const subtitle = buildSubtitle(host);
	return (
		<Link href={`/hosts/${hashHostId(host.host_id)}`}>
			<Card className="transition-colors cursor-pointer hover:bg-accent/50" data-testid="host-card">
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle className="text-base">{host.hostname}</CardTitle>
						<StatusBadge status={host.status} />
					</div>
					{subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
				</CardHeader>
				<CardContent className="space-y-2">
					<MetricRow
						icon={<Cpu className="h-4 w-4" strokeWidth={1.5} />}
						label="CPU"
						value={host.cpu_usage_pct !== null ? `${host.cpu_usage_pct.toFixed(1)}%` : "—"}
					/>
					<MetricRow
						icon={<HardDrive className="h-4 w-4" strokeWidth={1.5} />}
						label="Memory"
						value={host.mem_used_pct !== null ? `${host.mem_used_pct.toFixed(1)}%` : "—"}
					/>
					<MetricRow
						icon={<Clock className="h-4 w-4" strokeWidth={1.5} />}
						label="Uptime"
						value={formatUptime(host.uptime_seconds)}
					/>
					<div className="pt-2 border-t text-xs text-muted-foreground">
						Last seen: {formatLastSeen(host.last_seen)}
					</div>
				</CardContent>
			</Card>
		</Link>
	);
}

// Export formatters for testing
export { formatUptime, formatLastSeen, shortenOs, formatMemory, formatCpuTopology, buildSubtitle };
