import { type AlertItem, type AlertSeverity, hashHostId } from "@bat/shared";
import { Badge } from "@nocoo/basalt";
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
import { PageSummary, type ReadingItem } from "@/components/layout/reading";
import { Skeleton } from "@/components/ui/skeleton";
import { useAlerts, useHosts } from "@/hooks";
import { formatTimestamp } from "@/lib/format";
import { chart } from "@/lib/palette";

const TONE: Record<AlertSeverity, "destructive" | "warning" | "secondary"> = {
	critical: "destructive",
	warning: "warning",
	info: "secondary",
};

function AlertTable({ alerts }: { alerts: AlertItem[] }) {
	const { data: hosts } = useHosts();
	const hostMap = new Map(hosts?.map((host) => [host.host_id, host]) ?? []);

	return (
		<div data-basalt-table-container="" data-edge="attached">
			<Table aria-label="Active alerts">
				<TableHeader>
					<TableRow>
						<TableHead>Host</TableHead>
						<TableHead>Severity</TableHead>
						<TableHead>Rule</TableHead>
						<TableHead>Message</TableHead>
						<TableHead textAlign="end">Open for</TableHead>
						<TableHead textAlign="end">Since</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{alerts.map((alert) => {
						const host = hostMap.get(alert.host_id);
						const hostname = host?.hostname ?? alert.hostname ?? alert.host_id.slice(0, 8);
						return (
							<TableRow key={`${alert.host_id}-${alert.rule_id}`}>
								<TableCell>
									<Link
										to={`/hosts/${hashHostId(alert.host_id)}`}
										className="font-medium underline-offset-4 hover:underline"
										title={hostname}
									>
										{hostname}
									</Link>
								</TableCell>
								<TableCell>
									<Badge variant={TONE[alert.severity]}>{alert.severity}</Badge>
								</TableCell>
								<TableCell className="whitespace-nowrap font-mono text-basalt-sm">
									{alert.rule_id}
								</TableCell>
								<TableCell className="max-w-md truncate text-basalt-sm text-basalt-muted-foreground">
									{alert.message ?? "—"}
								</TableCell>
								<TableCell
									textAlign="end"
									className="whitespace-nowrap font-mono text-basalt-sm tabular-nums"
								>
									{Math.max(0, Math.round((Date.now() / 1000 - alert.triggered_at) / 60))}m
								</TableCell>
								<TableCell
									textAlign="end"
									className="whitespace-nowrap text-basalt-sm text-basalt-muted-foreground"
								>
									{formatTimestamp(alert.triggered_at)}
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}

function summaryItems(alerts: readonly AlertItem[]): ReadingItem[] {
	const critical = alerts.filter((alert) => alert.severity === "critical").length;
	const warning = alerts.filter((alert) => alert.severity === "warning").length;
	const hosts = new Set(alerts.map((alert) => alert.host_id)).size;
	const oldest = alerts.reduce<number | null>(
		(total, alert) => (total === null ? alert.triggered_at : Math.min(total, alert.triggered_at)),
		null,
	);
	return [
		{
			label: "Open alerts",
			value: String(alerts.length),
			detail: "active right now",
			color: chart.orange,
		},
		{ label: "Critical", value: String(critical), detail: "needs attention", color: chart.red },
		{ label: "Warning", value: String(warning), detail: "below threshold", color: chart.amber },
		{ label: "Hosts affected", value: String(hosts), detail: "in this list", color: chart.sky },
		{
			label: "Oldest",
			value:
				oldest === null ? "—" : `${Math.max(0, Math.round((Date.now() / 1000 - oldest) / 60))}m`,
			detail: "since it fired",
			color: chart.purple,
		},
	];
}

export function AlertsPage() {
	const { data: alerts, error, isLoading } = useAlerts();
	const records = alerts ?? [];

	return (
		<div className="space-y-basalt-layout" data-testid="alerts-page">
			<PageHeader
				title="Alerts"
				description="Active alerts and incident notifications across your fleet."
			/>

			{error && alerts === undefined ? (
				<LayerCard>
					<LayerCard.Body className="flex items-start gap-basalt-space-md">
						<AlertTriangle
							aria-hidden="true"
							className="mt-basalt-space-xs size-4 shrink-0 text-basalt-destructive"
						/>
						<p className="text-basalt-sm text-basalt-muted-foreground">{error.message}</p>
					</LayerCard.Body>
				</LayerCard>
			) : isLoading && alerts === undefined ? (
				<>
					<Skeleton className="h-24 w-full" />
					<Skeleton className="h-64 w-full" />
				</>
			) : (
				<>
					<PageSummary items={summaryItems(records)} />
					<LayerCard>
						<LayerCard.Header>
							<h2>Active</h2>
							<span className="text-basalt-sm text-basalt-muted-foreground">
								{records.length} open
							</span>
						</LayerCard.Header>
						{records.length === 0 ? (
							<LayerCard.Body>
								<div className="flex items-center gap-basalt-space-md text-basalt-sm text-basalt-muted-foreground">
									<Bell aria-hidden="true" className="size-4" strokeWidth={1.5} />
									No active alerts. All systems are running normally.
								</div>
							</LayerCard.Body>
						) : (
							<AlertTable alerts={records} />
						)}
					</LayerCard>
				</>
			)}
		</div>
	);
}
