import type { AlertItem } from "@bat/shared";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { Bell } from "lucide-react";
import { formatRelativeTime, severityColorClass, sortAlertsBySeverity } from "@/lib/alerts-format";

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
		<LayerCard>
			<LayerCard.Header>
				<h2 className="flex items-center gap-2">
					<Bell className="h-4 w-4" />
					Active Alerts
					<span className="text-basalt-sm font-normal text-basalt-muted-foreground">
						({sorted.length})
					</span>
				</h2>
			</LayerCard.Header>
			<LayerCard.Body>
				<ul className="space-y-2">
					{sorted.map((alert) => (
						<li
							key={`${alert.rule_id}-${alert.triggered_at}`}
							className="flex items-start gap-2 text-basalt-base min-w-0"
						>
							<span
								className={`text-basalt-sm font-medium uppercase shrink-0 w-16 ${severityColorClass(alert.severity)}`}
							>
								{alert.severity}
							</span>
							<div className="flex-1 min-w-0">
								<div className="font-mono text-basalt-sm text-basalt-muted-foreground truncate">
									{alert.rule_id}
								</div>
								{alert.message && <div className="truncate">{alert.message}</div>}
							</div>
							<span className="text-basalt-sm text-basalt-muted-foreground shrink-0 tabular-nums">
								{formatRelativeTime(alert.triggered_at, now)}
							</span>
						</li>
					))}
				</ul>
			</LayerCard.Body>
		</LayerCard>
	);
}
