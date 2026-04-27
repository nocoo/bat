import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime, severityColorClass, sortAlertsBySeverity } from "@/lib/alerts-format";
import type { AlertItem } from "@bat/shared";
import { Bell } from "lucide-react";

interface HostAlertsCardProps {
	alerts: AlertItem[];
	nowSeconds?: number;
}

export function HostAlertsCard({ alerts, nowSeconds }: HostAlertsCardProps) {
	if (alerts.length === 0) {
		return null;
	}
	const now = nowSeconds ?? Math.floor(Date.now() / 1000);
	const sorted = sortAlertsBySeverity(alerts);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<Bell className="h-4 w-4" />
					Active Alerts
					<span className="text-xs font-normal text-muted-foreground">({sorted.length})</span>
				</CardTitle>
			</CardHeader>
			<CardContent>
				<ul className="space-y-2">
					{sorted.map((alert) => (
						<li
							key={`${alert.rule_id}-${alert.triggered_at}`}
							className="flex items-start gap-2 text-sm min-w-0"
						>
							<span
								className={`text-xs font-medium uppercase shrink-0 w-16 ${severityColorClass(alert.severity)}`}
							>
								{alert.severity}
							</span>
							<div className="flex-1 min-w-0">
								<div className="font-mono text-xs text-muted-foreground truncate">
									{alert.rule_id}
								</div>
								{alert.message && <div className="truncate">{alert.message}</div>}
							</div>
							<span className="text-xs text-muted-foreground shrink-0 tabular-nums">
								{formatRelativeTime(alert.triggered_at, now)}
							</span>
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	);
}
