import type { HostStatus } from "@bat/shared";
import { Badge } from "@nocoo/basalt";
import {
	CircleAlert,
	CircleCheckBig,
	CircleOff,
	type LucideIcon,
	TriangleAlert,
} from "lucide-react";

const STATUS_CONFIG: Record<
	HostStatus,
	{
		label: string;
		variant: "success" | "warning" | "destructive" | "secondary" | "purple";
		icon: LucideIcon;
	}
> = {
	healthy: { label: "Healthy", variant: "success", icon: CircleCheckBig },
	warning: { label: "Warning", variant: "warning", icon: TriangleAlert },
	critical: { label: "Critical", variant: "destructive", icon: CircleAlert },
	offline: { label: "Offline", variant: "secondary", icon: CircleOff },
};

export function StatusBadge({
	status,
	responsiveLabel = false,
}: {
	status: HostStatus;
	/** Hide the word below `xl`, leaving the coloured icon to carry the state
	 *  (the label stays in `title` / `aria-label`). */
	responsiveLabel?: boolean;
}) {
	const config = STATUS_CONFIG[status];
	const Icon = config.icon;
	return (
		<Badge
			variant={config.variant}
			className="shrink-0 gap-basalt-space-sm whitespace-nowrap"
			data-testid="status-badge"
			title={config.label}
			aria-label={config.label}
		>
			<Icon className="size-3 shrink-0" strokeWidth={2} aria-hidden="true" />
			{responsiveLabel ? <span className="hidden xl:inline">{config.label}</span> : config.label}
		</Badge>
	);
}
