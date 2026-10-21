import type { HostStatus } from "@bat/shared";
import { Badge } from "@nocoo/basalt";
import { cn } from "@/lib/utils";

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
		<Badge
			variant={config.variant}
			className={cn(
				"shrink-0 whitespace-nowrap",
				status === "maintenance"
					? "!bg-purple !text-purple-foreground dark:!bg-purple dark:!text-purple-foreground font-medium"
					: undefined,
			)}
			data-testid="status-badge"
		>
			{config.label}
		</Badge>
	);
}
