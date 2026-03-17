import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { AlertItem, AlertSeverity } from "@bat/shared";
import { getAlertRuleLabel, hashHostId } from "@bat/shared";
import Link from "next/link";

function formatTriggeredAt(unixSeconds: number): string {
	const now = Math.floor(Date.now() / 1000);
	const delta = now - unixSeconds;
	if (delta < 60) return "just now";
	if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
	if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
	return `${Math.floor(delta / 86400)}d ago`;
}

function SeverityBadge({ severity }: { severity: AlertSeverity }) {
	if (severity === "critical") {
		return <Badge variant="destructive">Critical</Badge>;
	}
	if (severity === "warning") {
		return <Badge variant="warning">Warning</Badge>;
	}
	return <Badge variant="secondary">Info</Badge>;
}

interface AlertTableProps {
	alerts: AlertItem[];
	showHost?: boolean;
}

export function AlertTable({ alerts, showHost = true }: AlertTableProps) {
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
					{showHost && <TableHead>Host</TableHead>}
					<TableHead>Severity</TableHead>
					<TableHead>Rule</TableHead>
					<TableHead>Message</TableHead>
					<TableHead>Triggered</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{alerts.map((alert) => (
					<TableRow key={`${alert.host_id}-${alert.rule_id}`}>
						{showHost && (
							<TableCell>
								<Link
									href={`/hosts/${hashHostId(alert.host_id)}`}
									className="text-primary hover:underline"
								>
									{alert.hostname}
								</Link>
							</TableCell>
						)}
						<TableCell>
							<SeverityBadge severity={alert.severity} />
						</TableCell>
						<TableCell>{getAlertRuleLabel(alert.rule_id)}</TableCell>
						<TableCell className="text-sm text-muted-foreground">{alert.message ?? "—"}</TableCell>
						<TableCell className="text-muted-foreground text-xs whitespace-nowrap">
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
