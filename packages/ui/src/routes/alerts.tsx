import { AppShell } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useAlerts, useHosts } from "@/hooks";
import { type AlertItem, hashHostId } from "@bat/shared";
import { AlertTriangle, Bell } from "lucide-react";
import { formatTimestamp } from "@/lib/format";
import { Link } from "react-router";

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
									className="text-primary hover:underline"
								>
									{host?.hostname ?? alert.hostname ?? alert.host_id.slice(0, 8)}
								</Link>
							</TableCell>
							<TableCell className="font-mono text-xs">{alert.rule_id}</TableCell>
							<TableCell>
								<span
									className={
										alert.severity === "critical"
											? "text-destructive"
											: alert.severity === "warning"
												? "text-warning"
												: "text-muted-foreground"
									}
								>
									{alert.severity}
								</span>
							</TableCell>
							<TableCell className="text-sm max-w-md truncate">{alert.message ?? "—"}</TableCell>
							<TableCell className="text-muted-foreground text-sm">
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

	return (
		<AppShell breadcrumbs={[{ label: "Alerts" }]}>
			{isLoading && !alerts ? (
				<Card>
					<CardContent className="py-6 space-y-4">
						{Array.from({ length: 5 }, (_, i) => (
							<Skeleton key={`alert-skeleton-${i.toString()}`} className="h-8 w-full" />
						))}
					</CardContent>
				</Card>
			) : error && !alerts ? (
				<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
					<AlertTriangle className="h-12 w-12 mb-4 text-destructive" strokeWidth={1} />
					<h2 className="text-lg font-semibold text-foreground">Failed to load alerts</h2>
					<p className="mt-2 text-sm">{error.message}</p>
				</div>
			) : !alerts || alerts.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
					<Bell className="h-12 w-12 mb-4" strokeWidth={1} />
					<h2 className="text-lg font-semibold text-foreground">No active alerts</h2>
					<p className="mt-2 text-sm">All systems are running normally.</p>
				</div>
			) : (
				<Card>
					<CardContent className="py-2">
						<AlertTable alerts={alerts} />
					</CardContent>
				</Card>
			)}
		</AppShell>
	);
}
