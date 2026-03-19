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
import { Info } from "lucide-react";
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

/** Parse port numbers from a public_port alert message. */
function parsePublicPortMessage(message: string | null): number[] {
	if (!message) return [];
	const match = message.match(/Unexpected public ports:\s*(.+)/);
	if (!match?.[1]) return [];
	return match[1]
		.split(",")
		.map((s) => Number(s.trim()))
		.filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * Classify a public_port alert based on allowed ports.
 * Returns "all_allowed" | "partial" | "none".
 */
function classifyPublicPortAlert(
	alert: AlertItem,
	allowedPortsMap: Record<string, number[]>,
): "all_allowed" | "partial" | "none" {
	const allowed = allowedPortsMap[alert.host_id];
	if (!allowed || allowed.length === 0) return "none";
	const ports = parsePublicPortMessage(alert.message);
	if (ports.length === 0) return "none";
	const allowedSet = new Set(allowed);
	const allAllowed = ports.every((p) => allowedSet.has(p));
	if (allAllowed) return "all_allowed";
	const someAllowed = ports.some((p) => allowedSet.has(p));
	return someAllowed ? "partial" : "none";
}

/** Build annotated message for public_port alerts with partial allows. */
function annotatePortMessage(message: string, allowed: number[]): string {
	if (!message || allowed.length === 0) return message ?? "—";
	const allowedSet = new Set(allowed);
	// Replace each port number with annotated version
	return message.replace(/Unexpected public ports:\s*(.+)/, (_, portList: string) => {
		const annotated = portList
			.split(",")
			.map((s) => {
				const n = Number(s.trim());
				return allowedSet.has(n) ? `${n} (allowed)` : s.trim();
			})
			.join(", ");
		return `Unexpected public ports: ${annotated}`;
	});
}

interface AlertTableProps {
	alerts: AlertItem[];
	showHost?: boolean;
	/** Map of host_id → allowed port numbers. Used to annotate public_port alerts. */
	allowedPortsMap?: Record<string, number[]>;
}

export function AlertTable({ alerts, showHost = true, allowedPortsMap = {} }: AlertTableProps) {
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
				{alerts.map((alert) => {
					const isPublicPort = alert.rule_id === "public_port";
					const classification = isPublicPort
						? classifyPublicPortAlert(alert, allowedPortsMap)
						: "none";
					const displaySeverity: AlertSeverity =
						classification === "all_allowed" ? "info" : alert.severity;
					const hostAllowed = allowedPortsMap[alert.host_id] ?? [];
					const displayMessage =
						isPublicPort && classification === "partial"
							? annotatePortMessage(alert.message ?? "", hostAllowed)
							: (alert.message ?? "—");

					return (
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
								{classification === "all_allowed" ? (
									<Badge variant="secondary" className="gap-1">
										<Info className="h-3 w-3" />
										Allowed
									</Badge>
								) : (
									<SeverityBadge severity={displaySeverity} />
								)}
							</TableCell>
							<TableCell>{getAlertRuleLabel(alert.rule_id)}</TableCell>
							<TableCell className="text-sm text-muted-foreground">{displayMessage}</TableCell>
							<TableCell className="text-muted-foreground text-xs whitespace-nowrap">
								{formatTriggeredAt(alert.triggered_at)}
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}

// Export for testing
export { formatTriggeredAt };
