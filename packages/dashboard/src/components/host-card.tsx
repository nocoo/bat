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
			<span className="font-mono font-medium">{value}</span>
		</div>
	);
}

export function HostCard({ host }: { host: HostOverviewItem }) {
	return (
		<Link href={`/hosts/${hashHostId(host.host_id)}`}>
			<Card
				className="hover:bg-secondary/80 transition-colors cursor-pointer"
				data-testid="host-card"
			>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle className="text-base">{host.hostname}</CardTitle>
						<StatusBadge status={host.status} />
					</div>
				</CardHeader>
				<CardContent className="space-y-3">
					<MetricRow
						icon={<Cpu className="h-4 w-4" />}
						label="CPU"
						value={host.cpu_usage_pct !== null ? `${host.cpu_usage_pct.toFixed(1)}%` : "—"}
					/>
					<MetricRow
						icon={<HardDrive className="h-4 w-4" />}
						label="Memory"
						value={host.mem_used_pct !== null ? `${host.mem_used_pct.toFixed(1)}%` : "—"}
					/>
					<MetricRow
						icon={<Clock className="h-4 w-4" />}
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
export { formatUptime, formatLastSeen };
