import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { AlertItem } from "@bat/shared";
import { hashHostId } from "@bat/shared";
import Link from "next/link";

function formatTriggeredAt(unixSeconds: number): string {
	return new Date(unixSeconds * 1000).toLocaleString();
}

function SeverityBadge({ severity }: { severity: "warning" | "critical" }) {
	return (
		<Badge variant={severity === "critical" ? "destructive" : "warning"}>
			{severity === "critical" ? "Critical" : "Warning"}
		</Badge>
	);
}

export function AlertTable({ alerts }: { alerts: AlertItem[] }) {
	if (alerts.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
				<p className="text-sm">No active alerts</p>
			</div>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Host</TableHead>
					<TableHead>Rule</TableHead>
					<TableHead>Severity</TableHead>
					<TableHead>Value</TableHead>
					<TableHead>Triggered</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{alerts.map((alert) => (
					<TableRow key={`${alert.host_id}-${alert.rule_id}`}>
						<TableCell>
							<Link
								href={`/hosts/${hashHostId(alert.host_id)}`}
								className="text-primary hover:underline"
							>
								{alert.hostname}
							</Link>
						</TableCell>
						<TableCell className="font-mono text-xs">{alert.rule_id}</TableCell>
						<TableCell>
							<SeverityBadge severity={alert.severity} />
						</TableCell>
						<TableCell className="font-mono">
							{alert.value !== null ? alert.value.toFixed(1) : "—"}
						</TableCell>
						<TableCell className="text-muted-foreground text-xs">
							{formatTriggeredAt(alert.triggered_at)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

// Export for testing
export { formatTriggeredAt };
