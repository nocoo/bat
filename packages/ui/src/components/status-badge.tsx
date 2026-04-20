import { Badge } from "@/components/ui/badge";
import type { HostStatus } from "@bat/shared";

const STATUS_CONFIG: Record<
	HostStatus,
	{
		label: string;
		variant: "success" | "warning" | "destructive" | "secondary" | "purple";
	}
> = {
	healthy: { label: "Healthy", variant: "success" },
	warning: { label: "Warning", variant: "warning" },
	critical: { label: "Critical", variant: "destructive" },
	offline: { label: "Offline", variant: "secondary" },
	maintenance: { label: "Maintenance", variant: "purple" },
};

export function StatusBadge({ status }: { status: HostStatus }) {
	const config = STATUS_CONFIG[status];
	return (
		<Badge variant={config.variant} data-testid="status-badge">
			{config.label}
		</Badge>
	);
}
