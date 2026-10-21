import { type AlertItem, hashHostId } from "@bat/shared";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@nocoo/basalt/components/table";
import { AlertTriangle, Bell } from "lucide-react";
import { Link } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { useAlerts, useHosts } from "@/hooks";
import { formatTimestamp } from "@/lib/format";

function AlertTable({ alerts }: { alerts: AlertItem[] }) {
	const { data: hosts } = useHosts();
	const hostMap = new Map(hosts?.map((h) => [h.host_id, h]) ?? []);

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Host</TableHead>
					<TableHead>Rule</TableHead>
					<TableHead>Severity</TableHead>
					<TableHead>Message</TableHead>
					<TableHead>Since</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{alerts.map((alert) => {
					const host = hostMap.get(alert.host_id);
					return (
						<TableRow key={`${alert.host_id}-${alert.rule_id}`}>
							<TableCell>
								<Link
									to={`/hosts/${hashHostId(alert.host_id)}`}
									className="text-basalt-primary hover:underline"
								>
									{host?.hostname ?? alert.hostname ?? alert.host_id.slice(0, 8)}
								</Link>
							</TableCell>
							<TableCell className="font-mono text-basalt-sm">{alert.rule_id}</TableCell>
							<TableCell>
								<span
									className={
										alert.severity === "critical"
											? "text-basalt-destructive"
											: alert.severity === "warning"
												? "text-basalt-warning"
												: "text-basalt-muted-foreground"
									}
								>
									{alert.severity}
								</span>
							</TableCell>
							<TableCell className="text-basalt-base max-w-md truncate">
								{alert.message ?? "—"}
							</TableCell>
							<TableCell className="text-basalt-muted-foreground text-basalt-base">
								{formatTimestamp(alert.triggered_at)}
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}

export function AlertsPage() {
	const { data: alerts, error, isLoading } = useAlerts();

	return isLoading && !alerts ? (
		<LayerCard>
			<LayerCard.Body className="py-6 space-y-4">
				{Array.from({ length: 5 }, (_, i) => (
					<Skeleton key={`alert-skeleton-${i.toString()}`} className="h-8 w-full" />
				))}
			</LayerCard.Body>
		</LayerCard>
	) : error && !alerts ? (
		<div className="flex flex-col items-center justify-center py-20 text-basalt-muted-foreground">
			<AlertTriangle className="h-12 w-12 mb-4 text-basalt-destructive" strokeWidth={1} />
			<h2 className="text-basalt-lg font-semibold text-basalt-foreground">Failed to load alerts</h2>
			<p className="mt-2 text-basalt-base">{error.message}</p>
		</div>
	) : !alerts || alerts.length === 0 ? (
		<div className="space-y-4">
			<PageHeader
				title="Alerts"
				description="Active alerts and incident notifications across your fleet."
			/>
			<div className="flex flex-col items-center justify-center py-20 text-basalt-muted-foreground">
				<Bell className="h-12 w-12 mb-4" strokeWidth={1} />
				<h2 className="text-basalt-lg font-semibold text-basalt-foreground">No active alerts</h2>
				<p className="mt-2 text-basalt-base">All systems are running normally.</p>
			</div>
		</div>
	) : (
		<div className="space-y-4">
			<PageHeader
				title="Alerts"
				description="Active alerts and incident notifications across your fleet."
			/>
			<LayerCard>
				<LayerCard.Body className="py-2 overflow-x-auto">
					<AlertTable alerts={alerts} />
				</LayerCard.Body>
			</LayerCard>
		</div>
	);
}
